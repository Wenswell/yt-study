import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  findReusableMetadata,
  getMetadataCachePath,
  saveMetadataCache
} from "../src/services/metadata-cache.js";
import type { VideoMetadata } from "../src/types.js";

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
      title: "Demo",
      webpage_url: "https://www.youtube.com/watch?v=video123",
      formats: [],
      subtitles: { en: [{ ext: "vtt" }] },
      automatic_captions: {}
    };

    await saveMetadataCache(outputDir, "https://www.youtube.com/watch?v=video123", metadata);
    const reused = await findReusableMetadata(rootDir, "https://www.youtube.com/watch?v=video123");

    expect(reused?.id).toBe("video123");
    expect(getMetadataCachePath(outputDir)).toBe(path.join(outputDir, "video-metadata.json"));
  });

  it("skips invalid cache files", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-meta-cache-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "broken");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "video-metadata.json"), "{broken json", "utf8");

    const reused = await findReusableMetadata(rootDir, "https://www.youtube.com/watch?v=missing");
    expect(reused).toBeNull();
  });
});
