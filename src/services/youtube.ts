import path from "node:path";
import { access } from "node:fs/promises";
import { AppError } from "../lib/errors.js";
import { findFirstMatchingFile } from "../lib/files.js";
import { logger } from "../lib/logger.js";
import { execCommand } from "../lib/process.js";
import type { DownloadPaths, DownloadPlan, RawVideoMetadata, SubtitleSource, VideoMetadata } from "../types.js";

export interface YoutubeServiceOptions {
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath?: string;
  execCommand?: typeof execCommand;
}

export class YoutubeService {
  private readonly ytDlpPath: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly commandRunner: typeof execCommand;

  constructor(options: YoutubeServiceOptions) {
    this.ytDlpPath = options.ytDlpPath;
    this.ffmpegPath = options.ffmpegPath;
    this.ffprobePath = options.ffprobePath ?? getDefaultFfprobePath(options.ffmpegPath);
    this.commandRunner = options.execCommand ?? execCommand;
  }

  async getMetadata(url: string): Promise<VideoMetadata> {
    logger.info("youtube", `Fetching metadata for ${url}`);
    const { stdout } = await this.commandRunner(this.ytDlpPath, ["--dump-single-json", "--no-warnings", url]);
    const payload = JSON.parse(stdout) as RawVideoMetadata;

    if (!payload.id || !payload.webpage_url || !Array.isArray(payload.formats)) {
      throw new AppError("INVALID_METADATA", "yt-dlp returned unexpected video metadata.");
    }

    const metadata: VideoMetadata = {
      id: payload.id,
      fulltitle: payload.fulltitle ?? payload.title,
      webpage_url: payload.webpage_url,
      thumbnail: payload.thumbnail,
      description: payload.description,
      uploader_id: payload.uploader_id,
      duration: payload.duration,
      view_count: payload.view_count,
      categories: payload.categories,
      media_type: payload._type ?? "video",
      comment_count: payload.comment_count,
      like_count: payload.like_count,
      channel_follower_count: payload.channel_follower_count,
      timestamp: payload.timestamp,
      formats: payload.formats,
      subtitles: payload.subtitles,
      automatic_captions: payload.automatic_captions
    };

    logger.info("youtube", `Loaded metadata for video ${metadata.id}: ${metadata.fulltitle}`);
    return metadata;
  }

  createDownloadPlan(metadata: VideoMetadata): DownloadPlan {
    const selectedFormat = this.pickPreferredVideoFormat(metadata);
    const resolutionLabel = pickResolutionLabel(selectedFormat.height);
    const videoFormatSelector = buildVideoFormatSelector(selectedFormat);
    const fileStem = `${sanitizeFileName(metadata.fulltitle)} ${resolutionLabel}`;

    return {
      fileStem,
      resolutionLabel,
      videoFormatSelector
    };
  }

  pickVideoFormatSelector(metadata: VideoMetadata): string {
    return this.createDownloadPlan(metadata).videoFormatSelector;
  }

  pickEnglishSubtitleSource(metadata: VideoMetadata): SubtitleSource | undefined {
    const subtitles = metadata.subtitles ?? {};
    const automaticCaptions = metadata.automatic_captions ?? {};

    if ((subtitles.en?.length ?? 0) > 0) {
      logger.info("youtube", `Using manual English subtitles for ${metadata.id}`);
      return "manual";
    }

    if ((automaticCaptions.en?.length ?? 0) > 0) {
      logger.info("youtube", `Using auto-generated English subtitles for ${metadata.id}`);
      return "auto";
    }

    logger.warn("youtube", `No English subtitles found for ${metadata.id}`);
    return undefined;
  }

  async downloadAssets(url: string, outputDir: string, metadata: VideoMetadata): Promise<DownloadPaths> {
    const subtitleSource = this.pickEnglishSubtitleSource(metadata);
    const downloadPlan = this.createDownloadPlan(metadata);
    const baseOutput = path.join(outputDir, `${downloadPlan.fileStem}.%(ext)s`);

    const existingVideoFile = await this.findVideoFile(outputDir, downloadPlan.fileStem);
    const existingSubtitleFile = await this.findSubtitleFile(outputDir, downloadPlan.fileStem);
    const existingThumbnailFile = await this.findThumbnailFile(outputDir, downloadPlan.fileStem);

    if (existingVideoFile) {
      logger.info("youtube", `Reusing existing video file ${existingVideoFile}`);
    }

    if (existingSubtitleFile) {
      logger.info("youtube", `Reusing existing subtitle file ${existingSubtitleFile}`);
    }

    if (existingThumbnailFile) {
      logger.info("youtube", `Reusing existing thumbnail file ${existingThumbnailFile}`);
    }

    if (!existingSubtitleFile && subtitleSource) {
      logger.info("youtube", `Downloading ${subtitleSource} English subtitles first as srt`);
      const subtitleArgs = [
        "--no-playlist",
        "--skip-download",
        "--sub-langs",
        "en",
        "--sub-format",
        "srt",
        "--output",
        baseOutput
      ];

      if (subtitleSource === "manual") {
        subtitleArgs.push("--write-sub");
      } else {
        subtitleArgs.push("--write-auto-sub");
      }

      subtitleArgs.push(url);

      await this.commandRunner(this.ytDlpPath, subtitleArgs);
    } else if (!existingSubtitleFile) {
      logger.warn("youtube", `Skipping subtitle download for ${metadata.id} because no English track is available`);
    }

    if (!existingThumbnailFile) {
      logger.info("youtube", "Downloading thumbnail as jpg");
      await this.commandRunner(this.ytDlpPath, [
        "--no-playlist",
        "--skip-download",
        "--write-thumbnail",
        "--convert-thumbnails",
        "jpg",
        "--output",
        baseOutput,
        url
      ]);
    }

    if (!existingVideoFile) {
      logger.info("youtube", `Downloading video with format selector: ${downloadPlan.videoFormatSelector}`);
      await this.commandRunner(this.ytDlpPath, [
        "--no-playlist",
        "--format",
        downloadPlan.videoFormatSelector,
        "--merge-output-format",
        "mp4",
        "--ffmpeg-location",
        this.ffmpegPath,
        "--output",
        baseOutput,
        url
      ]);
    }

    const sourceVideoFile = existingVideoFile ?? await this.findVideoFile(outputDir, downloadPlan.fileStem);

    const subtitleFile = existingSubtitleFile ?? await this.findSubtitleFile(outputDir, downloadPlan.fileStem);
    const thumbnailFile = existingThumbnailFile ?? await this.findThumbnailFile(outputDir, downloadPlan.fileStem);

    if (!sourceVideoFile) {
      throw new AppError("VIDEO_DOWNLOAD_FAILED", "Video download completed without producing an MP4 file.");
    }

    if (subtitleSource && !subtitleFile) {
      throw new AppError("SUBTITLE_DOWNLOAD_FAILED", "Subtitle download completed without producing an English SRT file.");
    }

    if (!thumbnailFile) {
      throw new AppError("THUMBNAIL_DOWNLOAD_FAILED", "Thumbnail download completed without producing an image file.");
    }

    const videoFile = await this.ensureH264Mp4(sourceVideoFile);

    logger.info("youtube", `Prepared assets for ${metadata.id}`);
    return {
      videoFile,
      subtitleFile,
      thumbnailFile,
      subtitleSource,
      reusedVideoFile: Boolean(existingVideoFile),
      reusedSubtitleFile: Boolean(existingSubtitleFile),
      reusedThumbnailFile: Boolean(existingThumbnailFile)
    };
  }
  pickPreferredVideoFormat(metadata: VideoMetadata) {
    const videoFormats = metadata.formats.filter((format) =>
      Boolean(format.vcodec) && format.vcodec !== "none"
    );

    if (videoFormats.length === 0) {
      throw new AppError("VIDEO_FORMAT_MISSING", `No usable video format was found for ${metadata.id}.`);
    }

    const exact1080p = videoFormats.filter((format) => format.height === 1920 || format.height === 1080);
    const candidates = exact1080p.length > 0 ? exact1080p : videoFormats;

    if (exact1080p.length > 0) {
      logger.info("youtube", `Using exact 1080p video stream for ${metadata.id}`);
    } else {
      logger.warn("youtube", `1080p stream unavailable for ${metadata.id}, falling back to best available video`);
    }

    return [...candidates].sort(compareFormats)[0];
  }

  private async ensureH264Mp4(filePath: string): Promise<string> {
    const codec = await this.probeVideoCodec(filePath);

    if (codec === "h264") {
      logger.info("youtube", `Video already uses h264: ${filePath}`);
      return filePath;
    }

    const convertedPath = toH264OutputPath(filePath);

    if (await fileExists(convertedPath)) {
      const convertedCodec = await this.probeVideoCodec(convertedPath);
      if (convertedCodec === "h264") {
        logger.info("youtube", `Reusing existing h264 video file ${convertedPath}`);
        return convertedPath;
      }

      logger.warn("youtube", `Existing converted file ${convertedPath} is ${convertedCodec}, regenerating`);
    }

    logger.info("youtube", `Converting ${filePath} from ${codec} to h264 at ${convertedPath}`);

    try {
      await this.commandRunner(this.ffmpegPath, [
        "-y",
        "-i",
        filePath,
        "-c:v",
        "libx264",
        "-c:a",
        "copy",
        convertedPath
      ]);
    } catch (error) {
      throw new AppError(
        "VIDEO_TRANSCODE_FAILED",
        `Failed to convert ${path.basename(filePath)} to h264 mp4: ${toErrorMessage(error)}`
      );
    }

    if (!await fileExists(convertedPath)) {
      throw new AppError("VIDEO_TRANSCODE_OUTPUT_MISSING", "Video conversion completed without producing an H.264 MP4 file.");
    }

    return convertedPath;
  }

  private async probeVideoCodec(filePath: string): Promise<string> {
    try {
      const { stdout } = await this.commandRunner(this.ffprobePath, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ]);
      const codec = stdout.trim().toLowerCase();

      if (!codec) {
        throw new AppError("VIDEO_CODEC_MISSING", `ffprobe did not report a video codec for ${path.basename(filePath)}.`);
      }

      return codec;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "VIDEO_CODEC_PROBE_FAILED",
        `Failed to inspect video codec for ${path.basename(filePath)}: ${toErrorMessage(error)}`
      );
    }
  }

  private async findVideoFile(outputDir: string, fileStem: string): Promise<string | undefined> {
    return findFirstMatchingFile(outputDir, (name) =>
      name === `${fileStem}.mp4`
    );
  }

  private async findSubtitleFile(outputDir: string, fileStem: string): Promise<string | undefined> {
    return findFirstMatchingFile(outputDir, (name) =>
      new RegExp(`^${escapeRegExp(fileStem)}\\.(en|en-orig)\\.srt$`, "i").test(name)
    );
  }

  private async findThumbnailFile(outputDir: string, fileStem: string): Promise<string | undefined> {
    return findFirstMatchingFile(outputDir, (name) =>
      new RegExp(`^${escapeRegExp(fileStem)}\\.(jpg|jpeg|png|webp)$`, "i").test(name)
    );
  }
}

function buildFormatHeightSelector(height?: number): string {
  return typeof height === "number" ? `best[height=${height}]` : "best";
}

function compareFormats(
  left: { height?: number; vbr?: number; tbr?: number; fps?: number; filesize?: number; filesize_approx?: number },
  right: { height?: number; vbr?: number; tbr?: number; fps?: number; filesize?: number; filesize_approx?: number }
): number {
  return (
    scoreMetric(right.height) - scoreMetric(left.height) ||
    scoreMetric(right.vbr ?? right.tbr) - scoreMetric(left.vbr ?? left.tbr) ||
    scoreMetric(right.fps) - scoreMetric(left.fps) ||
    scoreMetric(right.filesize ?? right.filesize_approx) - scoreMetric(left.filesize ?? left.filesize_approx)
  );
}

function scoreMetric(value?: number): number {
  return typeof value === "number" ? value : -1;
}

function buildVideoFormatSelector(format: { format_id: string; acodec?: string; height?: number }): string {
  const fallbackSelector = buildFormatHeightSelector(format.height);

  if (format.acodec && format.acodec !== "none") {
    return `${format.format_id}/${fallbackSelector}/best`;
  }

  return `${format.format_id}+bestaudio/${fallbackSelector}/best`;
}

function pickResolutionLabel(height?: number): string {
  return typeof height === "number" ? `${height}p` : "best";
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "video";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDefaultFfprobePath(ffmpegPath: string): string {
  const directory = path.dirname(ffmpegPath);
  const fileName = path.basename(ffmpegPath).toLowerCase().endsWith(".exe") ? "ffprobe.exe" : "ffprobe";
  return path.join(directory, fileName);
}

function toH264OutputPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.h264${parsed.ext || ".mp4"}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
