import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { YoutubeService } from "../src/services/youtube.js";
import type { VideoMetadata } from "../src/types.js";

describe("YoutubeService metadata checks", () => {
  const service = new YoutubeService({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg"
  });

  it("fails when 1080p is unavailable", () => {
    const metadata: VideoMetadata = {
      id: "abc",
      title: "Demo",
      webpageUrl: "https://youtu.be/abc",
      formats: [{ formatId: "18", height: 720, vcodec: "avc1", acodec: "mp4a" }],
      subtitles: { en: [{ ext: "vtt" }] },
      automaticCaptions: {}
    };

    expect(() => service.ensure1080pAvailable(metadata)).toThrowError(AppError);
  });

  it("prefers manual subtitles and falls back to auto english", () => {
    const manual: VideoMetadata = {
      id: "abc",
      title: "Demo",
      webpageUrl: "https://youtu.be/abc",
      formats: [{ formatId: "137", height: 1080, vcodec: "avc1", acodec: "none" }],
      subtitles: { en: [{ ext: "vtt" }] },
      automaticCaptions: { en: [{ ext: "vtt" }] }
    };

    const auto: VideoMetadata = {
      ...manual,
      subtitles: {}
    };

    expect(service.pickEnglishSubtitleSource(manual)).toBe("manual");
    expect(service.pickEnglishSubtitleSource(auto)).toBe("auto");
  });
});
