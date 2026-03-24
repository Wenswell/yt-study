import { describe, expect, it } from "vitest";
import { renderFormattedMarkdown } from "../src/services/renderer.js";

describe("renderFormattedMarkdown", () => {
  it("renders titles, tags, sections, and vocabulary as plain markdown text", () => {
    const markdown = renderFormattedMarkdown({
      titleCandidates: ["标题1", "标题2"],
      tags: ["标签1", "#标签2"],
      sections: [
        { english: "English A", chinese: "中文A" },
        { english: "English B", chinese: "中文B" }
      ],
      vocabulary: [
        { phrase: "gravity", meaning: "重力" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "轨道" }
      ]
    });

    expect(markdown).toBe(
      "标题1\n标题2\n\n#标签1 #标签2\n\nEnglish A\n\n中文A\n\nEnglish B\n\n中文B\n\n·gravity 重力\n·orbit n. 轨道\n"
    );
  });
});
