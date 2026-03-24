import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { YoutubeService } from "../src/services/youtube.js";
import type { VideoMetadata } from "../src/types.js";

describe("YoutubeService metadata checks", () => {
  const service = new YoutubeService({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg"
  });

  it("falls back to best available video when 1080p is unavailable", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      title: "Demo",
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
      title: "Demo",
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
      title: "Demo",
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
      title: "Demo",
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
      title: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" }]
    };

    expect(() => service.pickEnglishSubtitleSource(metadata)).toThrowError(AppError);
  });

  it("creates readable file names from title and resolution", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      title: "Demo: Video/Test",
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
        title: "Demo Video",
        webpage_url: "https://youtu.be/abc",
        formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none", vbr: 2800 }],
        subtitles: { en: [{ ext: "srt" }] },
        automatic_captions: {}
      };

      const plan = service.createDownloadPlan(metadata);
      const videoFile = path.join(tempDir, `${plan.fileStem}.mp4`);
      const subtitleFile = path.join(tempDir, `${plan.fileStem}.en.srt`);

      await writeFile(videoFile, "video", "utf8");
      await writeFile(subtitleFile, "subtitle", "utf8");

      const result = await service.downloadAssets("https://youtu.be/abc", tempDir, metadata);
      expect(result.videoFile).toBe(videoFile);
      expect(result.subtitleFile).toBe(subtitleFile);
      expect(result.subtitleSource).toBe("manual");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
