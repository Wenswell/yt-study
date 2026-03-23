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
      titleCandidates: ["标题一", "标题二", "标题三"],
      chunks: [{
        chunkIndex: 0,
        sourceText: "Hello world",
        chineseTranslation: "你好，世界",
        explanations: [{ phrase: "world", chinese: "世界", note: "常见名词" }]
      }]
    };

    const markdown = renderMarkdown(metadata, chunks, formatted);
    expect(markdown).toContain("## Chinese Title Ideas");
    expect(markdown).toContain("你好，世界");
    expect(markdown).toContain("world: 世界");
  });
});
