import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMetadataPath } from "../src/services/metadata-cache.js";
import type { DownloadPaths, FormattingResult, VideoMetadata } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  metadata: undefined as VideoMetadata | undefined,
  assets: undefined as DownloadPaths | undefined,
  formatTranscript: vi.fn<(_: unknown, __: string, ___: string, ____: string) => Promise<FormattingResult>>(),
  createOpenAiJsonClient: vi.fn(() => vi.fn()),
  ensureTooling: vi.fn(async () => ({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg",
    bootstrapped: [] as string[]
  }))
}));

vi.mock("../src/services/tooling.js", () => ({
  ensureTooling: mocks.ensureTooling
}));

vi.mock("../src/services/openai.js", () => ({
  createOpenAiJsonClient: mocks.createOpenAiJsonClient,
  formatTranscript: mocks.formatTranscript
}));

vi.mock("../src/services/youtube.js", () => ({
  YoutubeService: class YoutubeService {
    async getMetadata(): Promise<VideoMetadata> {
      if (!mocks.metadata) {
        throw new Error("Missing mocked metadata");
      }

      return mocks.metadata;
    }

    async downloadAssets(): Promise<DownloadPaths> {
      if (!mocks.assets) {
        throw new Error("Missing mocked assets");
      }

      return mocks.assets;
    }
  }
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
  delete process.env.OPENAI_API_KEY;
  mocks.metadata = undefined;
  mocks.assets = undefined;
  mocks.formatTranscript.mockReset();
  mocks.createOpenAiJsonClient.mockClear();
  mocks.ensureTooling.mockClear();
  vi.resetModules();
});

describe("runWithOptions", () => {
  it("saves video and thumbnail metadata even when subtitles are unavailable", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-no-subtitle-test-"));
    tempDirs.push(rootDir);

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      description: "desc",
      formats: []
    };
    mocks.assets = {
      videoFile: path.join(rootDir, "video123", "demo.mp4"),
      thumbnailFile: path.join(rootDir, "video123", "demo.jpg"),
      reusedVideoFile: false,
      reusedSubtitleFile: false,
      reusedThumbnailFile: false
    };

    const { runWithOptions } = await import("../src/run.js");
    await runWithOptions({
      url: "https://www.youtube.com/watch?v=video123",
      outDir: rootDir,
      model: "gpt-test"
    });

    expect(mocks.createOpenAiJsonClient).not.toHaveBeenCalled();
    expect(mocks.formatTranscript).not.toHaveBeenCalled();

    const metadataPath = getMetadataPath(path.join(rootDir, "video123"));
    const saved = JSON.parse(await readFile(metadataPath, "utf8")) as {
      run?: {
        subtitleFile?: string;
        videoFile: string;
        thumbnailFile: string;
        model?: string;
      };
      formatted?: unknown;
    };

    expect(saved.run?.videoFile).toBe(mocks.assets.videoFile);
    expect(saved.run?.thumbnailFile).toBe(mocks.assets.thumbnailFile);
    expect(saved.run?.subtitleFile).toBeUndefined();
    expect(saved.run?.model).toBeUndefined();
    expect(saved.formatted).toBeUndefined();
  });
});
