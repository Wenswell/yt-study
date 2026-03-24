import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/services/renderer.js";
import type { FormattingResult, RunMetadata, TranscriptChunk } from "../src/types.js";

describe("renderMarkdown", () => {
  it("renders title ideas and chunk notes", () => {
    const metadata: RunMetadata = {
      sourceUrl: "https://youtu.be/demo",
      videoId: "demo123",
      videoTitle: "Demo Video",
      subtitleSource: "manual",
      subtitleFile: "subtitle.vtt",
      videoFile: "video.mp4",
      thumbnailFile: "thumbnail.jpg",
      markdownFile: "study-notes.md",
      model: "gpt-test",
      generatedAt: "2026-03-23T00:00:00.000Z"
    };

    const chunks: TranscriptChunk[] = [{
      index: 0,
      startMs: 0,
      endMs: 5000,
      sourceText: "Hello world",
      segments: []
    }];

    const formatted: FormattingResult = {
      titleCandidates: ["Title One", "Title Two", "Title Three"],
      chunks: [{
        chunkIndex: 0,
        chineseTranslation: "Hello in Chinese",
        explanations: [{ phrase: "world", chinese: "world-cn", note: "common noun" }]
      }]
    };

    const markdown = renderMarkdown(metadata, chunks, formatted);
    expect(markdown).toContain("## Chinese Title Ideas");
    expect(markdown).toContain("Hello world");
    expect(markdown).toContain("Hello in Chinese");
    expect(markdown).toContain("world: world-cn");
  });
});
