import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  findReusableMetadata,
  getMetadataPath,
  saveMetadata
} from "../src/services/metadata-cache.js";
import type { StoredMetadata, VideoMetadata } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("metadata cache", () => {
  it("saves and reloads reusable metadata by source url", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-meta-cache-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "video123");
    await mkdir(outputDir, { recursive: true });

    const metadata: VideoMetadata = {
      id: "video123",
      fulltitle: "Demo",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      formats: [],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    await saveMetadata(outputDir, {
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: metadata
    });
    const reused = await findReusableMetadata(rootDir, "https://www.youtube.com/watch?v=video123");

    expect(reused?.id).toBe("video123");
    expect(getMetadataPath(outputDir)).toBe(path.join(outputDir, "metadata.json"));
  });

  it("does not rewrite the cache when metadata is unchanged", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-meta-cache-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "video123");
    await mkdir(outputDir, { recursive: true });

    const metadata: VideoMetadata = {
      id: "video123",
      fulltitle: "Demo",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      formats: [],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    const storedMetadata: StoredMetadata = {
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: metadata
    };

    const metadataPath = await saveMetadata(outputDir, storedMetadata);
    const firstContent = await readFile(metadataPath, "utf8");
    await saveMetadata(outputDir, storedMetadata);
    const secondContent = await readFile(metadataPath, "utf8");

    expect(secondContent).toBe(firstContent);
  });

  it("stores run metadata in the same metadata file", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-meta-cache-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "video123");
    await mkdir(outputDir, { recursive: true });

    const metadata: VideoMetadata = {
      id: "video123",
      fulltitle: "Demo",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      formats: [],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    await saveMetadata(outputDir, {
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: metadata,
      run: {
        subtitleSource: "manual",
        subtitleFile: "subtitle.srt",
        videoFile: "video.mp4",
        thumbnailFile: "thumb.webp",
        formattedFile: "formatted.md",
        model: "gpt-test",
        generatedAt: "2026-03-24T00:00:00.000Z"
      },
      formatted: {
        titleCandidates: ["t1", "t2", "t3", "t4", "t5"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        sections: [{ english: "Hello", chinese: "你好" }],
        vocabulary: [{ phrase: "gravity", meaning: "重力" }]
      }
    });

    const saved = JSON.parse(await readFile(getMetadataPath(outputDir), "utf8")) as StoredMetadata;
    expect(saved.videoMetadata.id).toBe("video123");
    expect(saved.run?.videoFile).toBe("video.mp4");
    expect(saved.run?.formattedFile).toBe("formatted.md");
    expect(saved.formatted?.titleCandidates).toHaveLength(5);
  });

  it("skips invalid cache files", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-meta-cache-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "broken");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "metadata.json"), "{broken json", "utf8");

    const reused = await findReusableMetadata(rootDir, "https://www.youtube.com/watch?v=missing");
    expect(reused).toBeNull();
  });
});
