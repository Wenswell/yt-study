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
      formats: [{ format_id: "18", ext: "mp4", height: 720, vcodec: "avc1", acodec: "mp4a" }],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    expect(service.pickVideoFormatSelector(metadata)).toBe("bestvideo+bestaudio/best");
  });

  it("uses exact 1080p when available", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      title: "Demo",
      webpage_url: "https://youtu.be/abc",
      formats: [{ format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" }],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    expect(service.pickVideoFormatSelector(metadata)).toBe("bestvideo[height=1080]+bestaudio/best[height=1080]");
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
});
