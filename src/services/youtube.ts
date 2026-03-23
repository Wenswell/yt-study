import path from "node:path";
import { readFile } from "node:fs/promises";
import { AppError } from "../lib/errors.js";
import { findFirstMatchingFile } from "../lib/files.js";
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
    const { stdout } = await execCommand(this.ytDlpPath, ["--dump-single-json", "--no-warnings", url]);
    const payload = JSON.parse(stdout) as VideoMetadata;

    if (!payload.id || !payload.title || !Array.isArray(payload.formats)) {
      throw new AppError("INVALID_METADATA", "yt-dlp returned unexpected video metadata.");
    }

    return payload;
  }

  ensure1080pAvailable(metadata: VideoMetadata): void {
    const has1080p = metadata.formats.some((format) =>
      format.height === 1080 && format.vcodec && format.vcodec !== "none"
    );

    if (!has1080p) {
      throw new AppError("MISSING_1080P", `Video ${metadata.id} does not provide an exact 1080p stream.`);
    }
  }

  pickEnglishSubtitleSource(metadata: VideoMetadata): SubtitleSource {
    if ((metadata.subtitles.en?.length ?? 0) > 0) {
      return "manual";
    }

    if ((metadata.automaticCaptions.en?.length ?? 0) > 0) {
      return "auto";
    }

    throw new AppError("MISSING_SUBTITLES", "No English subtitle track was found for this video.");
  }

  async downloadAssets(url: string, tempDir: string, metadata: VideoMetadata): Promise<DownloadPaths> {
    const subtitleSource = this.pickEnglishSubtitleSource(metadata);
    const baseOutput = path.join(tempDir, `${metadata.id}.%(ext)s`);

    await execCommand(this.ytDlpPath, [
      "--no-playlist",
      "--format",
      "bestvideo[height=1080]+bestaudio/best[height=1080]",
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      this.ffmpegPath,
      "--output",
      baseOutput,
      url
    ]);

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

    return { videoFile, subtitleFile, subtitleSource };
  }

  async readSubtitleText(subtitleFile: string): Promise<string> {
    return readFile(subtitleFile, "utf8");
  }
}
