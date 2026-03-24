import path from "node:path";
import { readFile } from "node:fs/promises";
import { AppError } from "../lib/errors.js";
import { findFirstMatchingFile } from "../lib/files.js";
import { logger } from "../lib/logger.js";
import { execCommand } from "../lib/process.js";
import type { DownloadPlan, RawVideoMetadata, SubtitleSource, VideoMetadata } from "../types.js";

export interface DownloadPaths {
  videoFile: string;
  subtitleFile: string;
  subtitleSource: SubtitleSource;
}

export interface YoutubeServiceOptions {
  ytDlpPath: string;
  ffmpegPath: string;
}

export class YoutubeService {
  private readonly ytDlpPath: string;
  private readonly ffmpegPath: string;

  constructor(options: YoutubeServiceOptions) {
    this.ytDlpPath = options.ytDlpPath;
    this.ffmpegPath = options.ffmpegPath;
  }

  async getMetadata(url: string): Promise<VideoMetadata> {
    logger.info("youtube", `Fetching metadata for ${url}`);
    const { stdout } = await execCommand(this.ytDlpPath, ["--dump-single-json", "--no-warnings", url]);
    const payload = JSON.parse(stdout) as RawVideoMetadata;

    if (!payload.id || !payload.title || !payload.webpage_url || !Array.isArray(payload.formats)) {
      throw new AppError("INVALID_METADATA", "yt-dlp returned unexpected video metadata.");
    }

    const metadata: VideoMetadata = {
      id: payload.id,
      title: payload.title,
      webpage_url: payload.webpage_url,
      uploader: payload.uploader,
      duration: payload.duration,
      formats: payload.formats,
      subtitles: payload.subtitles,
      automatic_captions: payload.automatic_captions
    };

    logger.info("youtube", `Loaded metadata for video ${metadata.id}: ${metadata.title}`);
    return metadata;
  }

  createDownloadPlan(metadata: VideoMetadata): DownloadPlan {
    const selectedFormat = this.pickPreferredVideoFormat(metadata);
    const resolutionLabel = pickResolutionLabel(selectedFormat.height);
    const videoFormatSelector = buildVideoFormatSelector(selectedFormat);
    const fileStem = `${sanitizeFileName(metadata.title)} ${resolutionLabel}`;

    return {
      fileStem,
      resolutionLabel,
      videoFormatSelector
    };
  }

  pickVideoFormatSelector(metadata: VideoMetadata): string {
    return this.createDownloadPlan(metadata).videoFormatSelector;
  }

  pickEnglishSubtitleSource(metadata: VideoMetadata): SubtitleSource {
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
    throw new AppError("MISSING_SUBTITLES", "No English subtitle track was found for this video.");
  }

  async downloadAssets(url: string, outputDir: string, metadata: VideoMetadata): Promise<DownloadPaths> {
    const subtitleSource = this.pickEnglishSubtitleSource(metadata);
    const downloadPlan = this.createDownloadPlan(metadata);
    const baseOutput = path.join(outputDir, `${downloadPlan.fileStem}.%(ext)s`);

    const existingVideoFile = await this.findVideoFile(outputDir, downloadPlan.fileStem);
    const existingSubtitleFile = await this.findSubtitleFile(outputDir, downloadPlan.fileStem);

    if (existingVideoFile) {
      logger.info("youtube", `Reusing existing video file ${existingVideoFile}`);
    }

    if (existingSubtitleFile) {
      logger.info("youtube", `Reusing existing subtitle file ${existingSubtitleFile}`);
    }

    if (!existingSubtitleFile) {
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

      await execCommand(this.ytDlpPath, subtitleArgs);
    }

    if (!existingVideoFile) {
      logger.info("youtube", `Downloading video with format selector: ${downloadPlan.videoFormatSelector}`);
      await execCommand(this.ytDlpPath, [
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

    const videoFile = existingVideoFile ?? await this.findVideoFile(outputDir, downloadPlan.fileStem);

    const subtitleFile = existingSubtitleFile ?? await this.findSubtitleFile(outputDir, downloadPlan.fileStem);

    if (!videoFile) {
      throw new AppError("VIDEO_DOWNLOAD_FAILED", "Video download completed without producing an MP4 file.");
    }

    if (!subtitleFile) {
      throw new AppError("SUBTITLE_DOWNLOAD_FAILED", "Subtitle download completed without producing an English SRT file.");
    }

    logger.info("youtube", `Downloaded assets for ${metadata.id}`);
    return { videoFile, subtitleFile, subtitleSource };
  }

  async readSubtitleText(subtitleFile: string): Promise<string> {
    return readFile(subtitleFile, "utf8");
  }

  pickPreferredVideoFormat(metadata: VideoMetadata) {
    const videoFormats = metadata.formats.filter((format) =>
      Boolean(format.vcodec) && format.vcodec !== "none"
    );

    if (videoFormats.length === 0) {
      throw new AppError("VIDEO_FORMAT_MISSING", `No usable video format was found for ${metadata.id}.`);
    }

    const exact1080p = videoFormats.filter((format) => format.height === 1080);
    const candidates = exact1080p.length > 0 ? exact1080p : videoFormats;

    if (exact1080p.length > 0) {
      logger.info("youtube", `Using exact 1080p video stream for ${metadata.id}`);
    } else {
      logger.warn("youtube", `1080p stream unavailable for ${metadata.id}, falling back to best available video`);
    }

    return [...candidates].sort(compareFormats)[0];
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
