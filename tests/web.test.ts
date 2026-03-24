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
  it("keeps flagged items at the bottom and exposes the flagged field", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "yt-web-test-"));
    tempDirs.push(rootDir);

    const outputDir = path.join(rootDir, "video123");
    const flaggedOutputDir = path.join(rootDir, "video999");
    await mkdir(outputDir, { recursive: true });
    await mkdir(flaggedOutputDir, { recursive: true });

    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video123",
      videoMetadata: {
        id: "video123",
        fulltitle: "Demo Title",
        description: "Demo description",
        webpage_url: "https://www.youtube.com/watch?v=video123",
        uploader_id: "demo-channel",
        duration: 3723,
        view_count: 123456,
        categories: ["Education", "Science"],
        comment_count: 88,
        like_count: 999,
        channel_follower_count: 45678,
        timestamp: 1711234567,
        formats: []
      },
      run: {
        subtitleSource: "manual",
        subtitleFile: path.join(outputDir, "subtitle.srt"),
        videoFile: path.join(outputDir, "Demo #1 video.mp4"),
        thumbnailFile: path.join(outputDir, "thumb image.webp"),
        formattedFile: path.join(outputDir, "study-notes.md"),
        model: "gpt-test",
        generatedAt: "2026-03-24T00:00:00.000Z"
      }
    }), "utf8");

    await writeFile(path.join(flaggedOutputDir, "metadata.json"), JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=video999",
      flagged: true,
      videoMetadata: {
        id: "video999",
        fulltitle: "Flagged Title",
        webpage_url: "https://www.youtube.com/watch?v=video999",
        formats: []
      },
      run: {
        videoFile: path.join(flaggedOutputDir, "flagged.mp4"),
        thumbnailFile: path.join(flaggedOutputDir, "flagged.webp"),
        generatedAt: "2026-03-25T00:00:00.000Z"
      }
    }), "utf8");

    const items = await listDownloadedItems(rootDir);
    expect(items).toHaveLength(2);
    expect(items[0].fulltitle).toBe("Demo Title");
    expect(items[0].flagged).toBe(false);
    expect(items[0].formattedUrl).toBe("/outputs/video123/study-notes.md");
    expect(items[1].fulltitle).toBe("Flagged Title");
    expect(items[1].flagged).toBe(true);
  });
});
