import path from "node:path";
import { readFile } from "node:fs/promises";
import { AppError } from "../lib/errors.js";
import { findFirstMatchingFile } from "../lib/files.js";
import { logger } from "../lib/logger.js";
import { execCommand } from "../lib/process.js";
import type { SubtitleSource, VideoMetadata } from "../types.js";

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
    const payload = JSON.parse(stdout) as VideoMetadata;

    if (!payload.id || !payload.title || !payload.webpage_url || !Array.isArray(payload.formats)) {
      throw new AppError("INVALID_METADATA", "yt-dlp returned unexpected video metadata.");
    }

    logger.info("youtube", `Loaded metadata for video ${payload.id}: ${payload.title}`);
    return payload;
  }

  pickVideoFormatSelector(metadata: VideoMetadata): string {
    const has1080p = metadata.formats.some((format) =>
      format.height === 1080 && format.vcodec && format.vcodec !== "none"
    );

    if (has1080p) {
      logger.info("youtube", `Using exact 1080p video stream for ${metadata.id}`);
      return "bestvideo[height=1080]+bestaudio/best[height=1080]";
    }

    logger.warn("youtube", `1080p stream unavailable for ${metadata.id}, falling back to best available video`);
    return "bestvideo+bestaudio/best";
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

  async downloadAssets(url: string, tempDir: string, metadata: VideoMetadata): Promise<DownloadPaths> {
    const subtitleSource = this.pickEnglishSubtitleSource(metadata);
    const videoFormatSelector = this.pickVideoFormatSelector(metadata);
    const baseOutput = path.join(tempDir, `${metadata.id}.%(ext)s`);

    logger.info("youtube", `Downloading ${subtitleSource} English subtitles first`);
    const subtitleArgs = [
      "--no-playlist",
      "--skip-download",
      "--sub-langs",
      "en",
      "--sub-format",
      "vtt",
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

    logger.info("youtube", `Downloading video with format selector: ${videoFormatSelector}`);
    await execCommand(this.ytDlpPath, [
      "--no-playlist",
      "--format",
      videoFormatSelector,
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      this.ffmpegPath,
      "--output",
      baseOutput,
      url
    ]);

    const videoFile = await findFirstMatchingFile(tempDir, (name) =>
      name.startsWith(`${metadata.id}.`) && name.endsWith(".mp4")
    );

    const subtitleFile = await findFirstMatchingFile(tempDir, (name) =>
      name.startsWith(`${metadata.id}.`) && /\.(en|en-orig)\.vtt$/i.test(name)
    );

    if (!videoFile) {
      throw new AppError("VIDEO_DOWNLOAD_FAILED", "Video download completed without producing an MP4 file.");
    }

    if (!subtitleFile) {
      throw new AppError("SUBTITLE_DOWNLOAD_FAILED", "Subtitle download completed without producing an English VTT file.");
    }

    logger.info("youtube", `Downloaded assets for ${metadata.id}`);
    return { videoFile, subtitleFile, subtitleSource };
  }

  async readSubtitleText(subtitleFile: string): Promise<string> {
    return readFile(subtitleFile, "utf8");
  }
}
