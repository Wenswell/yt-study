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
  formatTranscript: vi.fn<(_: unknown, __: string, ___: string, ____: string, _____?: unknown) => Promise<FormattingResult>>(),
  createOpenAiJsonClient: vi.fn(() => vi.fn()),
  ensureTooling: vi.fn(async () => ({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
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

function buildShortFormattingResult(): FormattingResult {
  return {
    titleCandidates: ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
    tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
    sections: [{ english: "English A", chinese: "中文A" }],
    focusVocabulary: [
      { phrase: "gravity", meaning: "重力" },
      { phrase: "motion", meaning: "运动" },
      { phrase: "mass", meaning: "质量" },
      { phrase: "force", meaning: "力" }
    ],
    challengingVocabulary: [
      { phrase: "orbital decay", meaning: "轨道衰减" },
      { phrase: "centripetal", meaning: "向心" },
      { phrase: "apogee", meaning: "远地点" },
      { phrase: "periapsis", meaning: "近拱点" }
    ]
  };
}

function buildNonShortFormattingResult(): FormattingResult {
  return {
    titleCandidates: ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
    tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
    sections: [],
    focusVocabulary: [
      { phrase: "gravity", meaning: "gravity" },
      { phrase: "motion", meaning: "motion" },
      { phrase: "mass", meaning: "mass" },
      { phrase: "force", meaning: "force" }
    ],
    challengingVocabulary: [
      { phrase: "orbital decay", meaning: "orbital decay" },
      { phrase: "centripetal", meaning: "centripetal" },
      { phrase: "apogee", meaning: "apogee" },
      { phrase: "periapsis", meaning: "periapsis" }
    ]
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
  delete process.env.OPENAI_API_KEY;
  mocks.metadata = undefined;
  mocks.assets = undefined;
  mocks.formatTranscript.mockReset();
  mocks.createOpenAiJsonClient.mockReset();
  mocks.createOpenAiJsonClient.mockImplementation(() => vi.fn());
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
      duration: 120,
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
      duration: 120,
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
      formatted: buildShortFormattingResult()
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
    expect(studyNotes).toContain("重点词汇");
    expect(studyNotes).toContain("难点词汇");
    expect(studyNotes).toContain("• gravity 重力");
  });

  it("calls OpenAI again when formatted-info.md already exists", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-cache-miss-test-"));
    tempDirs.push(rootDir);
    process.env.OPENAI_API_KEY = "test-key";

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      uploader_id: "demo-channel",
      duration: 120,
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
    mocks.formatTranscript.mockResolvedValue(buildShortFormattingResult());

    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: mocks.metadata,
      formatted: buildShortFormattingResult()
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

    expect(mocks.createOpenAiJsonClient).toHaveBeenCalledWith("test-key", "gpt-test", undefined);
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
      duration: 120,
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

  it("uses the gemini model and appends the merged transcript for non-short media", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-run-long-form-test-"));
    tempDirs.push(rootDir);
    process.env.OPENAI_API_KEY = "test-key";

    mocks.metadata = {
      id: "video123",
      fulltitle: "Demo",
      uploader_id: "demo-channel",
      duration: 240,
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
    mocks.formatTranscript.mockResolvedValue(buildNonShortFormattingResult());

    if (!mocks.assets.subtitleFile) {
      throw new Error("Missing mocked subtitle file");
    }
    await writeFile(mocks.assets.subtitleFile, "1\n00:00:00,000 --> 00:00:01,000\nHello world\n\n2\n00:00:01,000 --> 00:00:02,000\nfrom subtitles\n", "utf8");

    const { runWithOptions } = await import("../src/run.js");
    await runWithOptions({
      url: "https://www.youtube.com/watch?v=video123",
      outDir: rootDir,
      model: "gpt-test"
    });

    expect(mocks.createOpenAiJsonClient).toHaveBeenCalledWith(
      "test-key",
      "gemini-3.1-flash-lite-preview-thinking-medium",
      undefined
    );
    expect(mocks.formatTranscript).toHaveBeenCalledWith(
      expect.any(Function),
      "Demo",
      "desc",
      "Hello world from subtitles",
      { mode: "non-short" }
    );

    const saved = JSON.parse(await readFile(getMetadataPath(outputDir), "utf8")) as {
      run?: { model?: string };
    };
    expect(saved.run?.model).toBe("gemini-3.1-flash-lite-preview-thinking-medium");

    const studyNotes = await readFile(path.join(outputDir, "formatted-info.md"), "utf8");
    expect(studyNotes).toContain("Hello world from subtitles");
    expect(studyNotes).not.toContain("中文A");
  });
});
