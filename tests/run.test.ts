import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOutputDirectoryName } from "../src/lib/output-dir.js";
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
      uploader_id: "demo-channel",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      description: "desc",
      formats: []
    };
    const outputDir = path.join(rootDir, buildOutputDirectoryName(mocks.metadata));
    mocks.assets = {
      videoFile: path.join(outputDir, "demo.mp4"),
      thumbnailFile: path.join(outputDir, "demo.jpg"),
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

    const metadataPath = getMetadataPath(outputDir);
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
    expect(saved.run?.model).toBe("gpt-test");
    expect(saved.formatted).toBeUndefined();
  });

  it("rebuilds formatted-info.md from cached formatted data without calling OpenAI", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-cache-hit-test-"));
    tempDirs.push(rootDir);

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      uploader_id: "demo-channel",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      description: "desc",
      formats: []
    };
    const outputDir = path.join(rootDir, buildOutputDirectoryName(mocks.metadata));
    await mkdir(outputDir, { recursive: true });
    mocks.assets = {
      videoFile: path.join(outputDir, "demo.mp4"),
      subtitleFile: path.join(outputDir, "demo.srt"),
      subtitleSource: "manual",
      thumbnailFile: path.join(outputDir, "demo.jpg"),
      reusedVideoFile: false,
      reusedSubtitleFile: false,
      reusedThumbnailFile: false
    };

    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: mocks.metadata,
      formatted: {
        titleCandidates: ["标题1", "标题2", "标题3", "标题4", "标题5"],
        tags: ["标签1", "标签2", "标签3", "标签4", "标签5"],
        sections: [{ english: "English A", chinese: "中文A" }],
        vocabulary: [{ phrase: "gravity", meaning: "重力" }]
      }
    }, null, 2), "utf8");

    const { runWithOptions } = await import("../src/run.js");
    await runWithOptions({
      url: "https://www.youtube.com/watch?v=video123",
      outDir: rootDir,
      model: "gpt-test"
    });

    expect(mocks.createOpenAiJsonClient).not.toHaveBeenCalled();
    expect(mocks.formatTranscript).not.toHaveBeenCalled();

    const studyNotes = await readFile(path.join(outputDir, "formatted-info.md"), "utf8");
    expect(studyNotes).toContain("标题1");
    expect(studyNotes).toContain("·gravity 重力");
  });

  it("calls OpenAI again when formatted-info.md already exists", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-cache-miss-test-"));
    tempDirs.push(rootDir);
    process.env.OPENAI_API_KEY = "test-key";

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      uploader_id: "demo-channel",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      description: "desc",
      formats: []
    };
    const outputDir = path.join(rootDir, buildOutputDirectoryName(mocks.metadata));
    await mkdir(outputDir, { recursive: true });
    mocks.assets = {
      videoFile: path.join(outputDir, "demo.mp4"),
      subtitleFile: path.join(outputDir, "demo.srt"),
      subtitleSource: "manual",
      thumbnailFile: path.join(outputDir, "demo.jpg"),
      reusedVideoFile: false,
      reusedSubtitleFile: false,
      reusedThumbnailFile: false
    };
    mocks.formatTranscript.mockResolvedValue({
      titleCandidates: ["标题1", "标题2", "标题3", "标题4", "标题5"],
      tags: ["标签1", "标签2", "标签3", "标签4", "标签5"],
      sections: [{ english: "English A", chinese: "中文A" }],
      vocabulary: [{ phrase: "gravity", meaning: "重力" }]
    });

    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: mocks.metadata,
      formatted: {
        titleCandidates: ["旧标题1", "旧标题2", "旧标题3", "旧标题4", "旧标题5"],
        tags: ["旧标签1", "旧标签2", "旧标签3", "旧标签4", "旧标签5"],
        sections: [{ english: "Old English", chinese: "旧中文" }],
        vocabulary: [{ phrase: "orbit", meaning: "轨道" }]
      }
    }, null, 2), "utf8");
    await writeFile(path.join(outputDir, "formatted-info.md"), "existing", "utf8");
    if (!mocks.assets.subtitleFile) {
      throw new Error("Missing mocked subtitle file");
    }
    await writeFile(mocks.assets.subtitleFile, "1\n00:00:00,000 --> 00:00:01,000\nHello\n", "utf8");

    const { runWithOptions } = await import("../src/run.js");
    await runWithOptions({
      url: "https://www.youtube.com/watch?v=video123",
      outDir: rootDir,
      model: "gpt-test"
    });

    expect(mocks.createOpenAiJsonClient).toHaveBeenCalled();
    expect(mocks.formatTranscript).toHaveBeenCalled();
  });

  it("persists run metadata before surfacing LLM failures", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-llm-failure-test-"));
    tempDirs.push(rootDir);
    process.env.OPENAI_API_KEY = "test-key";

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      uploader_id: "demo-channel",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      description: "desc",
      formats: []
    };
    const outputDir = path.join(rootDir, buildOutputDirectoryName(mocks.metadata));
    await mkdir(outputDir, { recursive: true });
    mocks.assets = {
      videoFile: path.join(outputDir, "demo.mp4"),
      subtitleFile: path.join(outputDir, "demo.srt"),
      subtitleSource: "manual",
      thumbnailFile: path.join(outputDir, "demo.jpg"),
      reusedVideoFile: false,
      reusedSubtitleFile: false,
      reusedThumbnailFile: false
    };
    mocks.formatTranscript.mockRejectedValue(new Error("LLM exploded"));

    if (!mocks.assets.subtitleFile) {
      throw new Error("Missing mocked subtitle file");
    }
    await writeFile(mocks.assets.subtitleFile, "1\n00:00:00,000 --> 00:00:01,000\nHello\n", "utf8");

    const { runWithOptions } = await import("../src/run.js");
    await expect(runWithOptions({
      url: "https://www.youtube.com/watch?v=video123",
      outDir: rootDir,
      model: "gpt-test"
    })).rejects.toThrow("LLM exploded");

    const saved = JSON.parse(await readFile(getMetadataPath(outputDir), "utf8")) as {
      run?: {
        subtitleFile?: string;
        subtitleSource?: string;
        videoFile: string;
        thumbnailFile: string;
        model?: string;
      };
      formatted?: unknown;
    };

    expect(saved.run?.videoFile).toBe(mocks.assets.videoFile);
    expect(saved.run?.thumbnailFile).toBe(mocks.assets.thumbnailFile);
    expect(saved.run?.subtitleFile).toBe(mocks.assets.subtitleFile);
    expect(saved.run?.subtitleSource).toBe("manual");
    expect(saved.run?.model).toBe("gpt-test");
    expect(saved.formatted).toBeUndefined();
  });
});
