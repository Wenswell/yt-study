import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { YoutubeService } from "../src/services/youtube.js";
import type { VideoMetadata } from "../src/types.js";

describe("YoutubeService metadata checks", () => {
  const service = new YoutubeService({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg"
  });

  function buildMetadata(): VideoMetadata {
    return {
      id: "abc",
      fulltitle: "Demo Video",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }]
    };
  }

  it("falls back to best available video when 1080p is unavailable", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "18", ext: "mp4", height: 720, vcodec: "avc1", acodec: "mp4a", vbr: 2200 }],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    expect(service.pickVideoFormatSelector(metadata)).toBe("18/best[height=720]/best");
  });

  it("uses exact 1080p when available", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    expect(service.pickVideoFormatSelector(metadata)).toBe("137+bestaudio/best[height=1080]/best");
  });

  it("picks the highest vbr format within the target resolution", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [
        { format_id: "136", ext: "mp4", height: 720, vcodec: "avc1", acodec: "none", vbr: 1800 },
        { format_id: "299", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 4200 },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }
      ]
    };

    expect(service.pickVideoFormatSelector(metadata)).toBe("299+bestaudio/best[height=1080]/best");
  });

  it("prefers manual subtitles and falls back to auto english", () => {
    const manual: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" }],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: { en: [{ ext: "vtt" }] }
    };

    const auto: VideoMetadata = {
      ...manual,
      subtitles: {}
    };

    expect(service.pickEnglishSubtitleSource(manual)).toBe("manual");
    expect(service.pickEnglishSubtitleSource(auto)).toBe("auto");
  });

  it("handles missing subtitle objects without crashing", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" }]
    };

    expect(service.pickEnglishSubtitleSource(metadata)).toBeUndefined();
  });

  it("creates readable file names from title and resolution", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      fulltitle: "Demo: Video/Test",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }]
    };

    expect(service.createDownloadPlan(metadata)).toEqual({
      fileStem: "Demo Video Test 1080p",
      resolutionLabel: "1080p",
      videoFormatSelector: "137+bestaudio/best[height=1080]/best"
    });
  });

  it("reuses existing video and srt subtitle files", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "yt-reuse-test-"));

    try {
      const metadata: VideoMetadata = {
        id: "abc",
        fulltitle: "Demo Video",
        webpage_url: "https://youtu.be/abc",
        formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }],
        subtitles: { en: [{ ext: "srt" }] },
        automatic_captions: {}
      };

      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const subtitleFile = path.join(tempDir, `${plan.fileStem}.en.srt`);
      const thumbnailFile = path.join(tempDir, `${plan.fileStem}.jpg`);
      const serviceWithProbe = new YoutubeService({
        ytDlpPath: "yt-dlp",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        execCommand: async (command) => {
          if (command !== "ffprobe") {
            throw new Error(`Unexpected command: ${command}`);
          }

          return { stdout: "h264\n", stderr: "" };
        }
      });

      await writeFile(videoFile, "video", "utf8");
      await writeFile(subtitleFile, "subtitle", "utf8");
      await writeFile(thumbnailFile, "thumbnail", "utf8");

      const result = await serviceWithProbe.downloadAssets("https://youtu.be/abc", tempDir, metadata);
      expect(result.videoFile).toBe(videoFile);
      expect(result.subtitleFile).toBe(subtitleFile);
      expect(result.thumbnailFile).toBe(thumbnailFile);
      expect(result.subtitleSource).toBe("manual");
      expect(result.reusedVideoFile).toBe(true);
      expect(result.reusedSubtitleFile).toBe(true);
      expect(result.reusedThumbnailFile).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("continues when subtitles are unavailable but video and thumbnail already exist", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "yt-no-subtitle-test-"));

    try {
      const metadata: VideoMetadata = {
        id: "abc",
        fulltitle: "Demo Video",
        webpage_url: "https://youtu.be/abc",
        formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }]
      };

      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const thumbnailFile = path.join(tempDir, `${plan.fileStem}.jpg`);
      const serviceWithProbe = new YoutubeService({
        ytDlpPath: "yt-dlp",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        execCommand: async (command) => {
          if (command !== "ffprobe") {
            throw new Error(`Unexpected command: ${command}`);
          }

          return { stdout: "h264\n", stderr: "" };
        }
      });

      await writeFile(videoFile, "video", "utf8");
      await writeFile(thumbnailFile, "thumbnail", "utf8");

      const result = await serviceWithProbe.downloadAssets("https://youtu.be/abc", tempDir, metadata);
      expect(result.videoFile).toBe(videoFile);
      expect(result.subtitleFile).toBeUndefined();
      expect(result.thumbnailFile).toBe(thumbnailFile);
      expect(result.subtitleSource).toBeUndefined();
      expect(result.reusedVideoFile).toBe(true);
      expect(result.reusedSubtitleFile).toBe(false);
      expect(result.reusedThumbnailFile).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps an existing h264 mp4 without converting", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "yt-h264-keep-test-"));

    try {
      const metadata = buildMetadata();
      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const thumbnailFile = path.join(tempDir, `${plan.fileStem}.jpg`);
      const commands: Array<{ command: string; args: string[] }> = [];
      const serviceWithProbe = new YoutubeService({
        ytDlpPath: "yt-dlp",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        execCommand: async (command, args) => {
          commands.push({ command, args });
          if (command === "ffprobe") {
            return { stdout: "h264\n", stderr: "" };
          }

          throw new Error(`Unexpected command: ${command}`);
        }
      });

      await writeFile(videoFile, "video", "utf8");
      await writeFile(thumbnailFile, "thumbnail", "utf8");

      const result = await serviceWithProbe.downloadAssets("https://youtu.be/abc", tempDir, metadata);

      expect(result.videoFile).toBe(videoFile);
      expect(commands).toEqual([
        {
          command: "ffprobe",
          args: [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            videoFile
          ]
        }
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("converts a non-h264 mp4 and returns the converted path", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "yt-h264-convert-test-"));

    try {
      const metadata = buildMetadata();
      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const convertedVideoFile = path.join(tempDir, `${plan.fileStem}.h264.mp4`);
      const thumbnailFile = path.join(tempDir, `${plan.fileStem}.jpg`);
      const commands: Array<{ command: string; args: string[] }> = [];
      const serviceWithProbe = new YoutubeService({
        ytDlpPath: "yt-dlp",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        execCommand: async (command, args) => {
          commands.push({ command, args });
          if (command === "ffprobe") {
            return { stdout: "hevc\n", stderr: "" };
          }

          if (command === "ffmpeg") {
            await writeFile(convertedVideoFile, "converted", "utf8");
            return { stdout: "", stderr: "" };
          }

          throw new Error(`Unexpected command: ${command}`);
        }
      });

      await writeFile(videoFile, "video", "utf8");
      await writeFile(thumbnailFile, "thumbnail", "utf8");

      const result = await serviceWithProbe.downloadAssets("https://youtu.be/abc", tempDir, metadata);

      expect(result.videoFile).toBe(convertedVideoFile);
      expect(commands).toEqual([
        {
          command: "ffprobe",
          args: [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            videoFile
          ]
        },
        {
          command: "ffmpeg",
          args: [
            "-y",
            "-i",
            videoFile,
            "-c:v",
            "libx264",
            "-c:a",
            "copy",
            convertedVideoFile
          ]
        }
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses an existing converted h264 mp4", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "yt-h264-reuse-converted-test-"));

    try {
      const metadata = buildMetadata();
      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const convertedVideoFile = path.join(tempDir, `${plan.fileStem}.h264.mp4`);
      const thumbnailFile = path.join(tempDir, `${plan.fileStem}.jpg`);
      const commands: Array<{ command: string; args: string[] }> = [];
      const serviceWithProbe = new YoutubeService({
        ytDlpPath: "yt-dlp",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        execCommand: async (command, args) => {
          commands.push({ command, args });
          if (command !== "ffprobe") {
            throw new Error(`Unexpected command: ${command}`);
          }

          if (args.at(-1) === videoFile) {
            return { stdout: "vp9\n", stderr: "" };
          }

          if (args.at(-1) === convertedVideoFile) {
            return { stdout: "h264\n", stderr: "" };
          }

          throw new Error(`Unexpected ffprobe target: ${args.at(-1)}`);
        }
      });

      await writeFile(videoFile, "video", "utf8");
      await writeFile(convertedVideoFile, "converted", "utf8");
      await writeFile(thumbnailFile, "thumbnail", "utf8");

      const result = await serviceWithProbe.downloadAssets("https://youtu.be/abc", tempDir, metadata);

      expect(result.videoFile).toBe(convertedVideoFile);
      expect(commands).toEqual([
        {
          command: "ffprobe",
          args: [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            videoFile
          ]
        },
        {
          command: "ffprobe",
          args: [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            convertedVideoFile
          ]
        }
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
