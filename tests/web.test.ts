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
        formattedFile: path.join(outputDir, "formatted-info.md"),
        model: "gpt-test",
        generatedAt: "2026-03-24T00:00:00.000Z"
      },
      formatted: {
        titleCandidates: ["t1", "t2", "t3", "t4", "t5"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        sections: [{ english: "Hello", chinese: "你好" }],
        vocabulary: [{ phrase: "gravity", meaning: "重力" }]
      }
    }), "utf8");

    const items = await listDownloadedItems(rootDir);
    expect(items).toHaveLength(1);
    expect(items[0].fulltitle).toBe("Demo Title");
    expect(items[0].description).toBe("Demo description");
    expect(items[0].uploaderId).toBe("demo-channel");
    expect(items[0].duration).toBe(3723);
    expect(items[0].viewCount).toBe(123456);
    expect(items[0].categories).toEqual(["Education", "Science"]);
    expect(items[0].commentCount).toBe(88);
    expect(items[0].likeCount).toBe(999);
    expect(items[0].channelFollowerCount).toBe(45678);
    expect(items[0].timestamp).toBe(1711234567);
    expect(items[0].formattedUrl).toBe("/outputs/video123/formatted-info.md");
    expect(items[0].videoUrl).toBe("/outputs/video123/Demo%20%231%20video.mp4");
    expect(items[0].thumbnailUrl).toBe("/outputs/video123/thumb%20image.webp");
  });
});
