import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { listDownloadedItems } from "../src/web.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("listDownloadedItems", () => {
  it("reads downloaded items from metadata files", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-web-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "video123");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: {
        id: "video123",
        title: "Demo Title",
        webpage_url: "https://www.youtube.com/watch?v=video123",
        formats: []
      },
      run: {
        subtitleSource: "manual",
        subtitleFile: path.join(outputDir, "subtitle.srt"),
        videoFile: path.join(outputDir, "video.mp4"),
        thumbnailFile: path.join(outputDir, "thumb.webp"),
        markdownFile: path.join(outputDir, "study-notes.md"),
        model: "gpt-test",
        generatedAt: "2026-03-24T00:00:00.000Z"
      }
    }), "utf8");

    const items = await listDownloadedItems(rootDir);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Demo Title");
    expect(items[0].markdownUrl).toBe("/outputs/video123/study-notes.md");
  });
});
