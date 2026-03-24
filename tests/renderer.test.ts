import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/services/renderer.js";
import type { FormattingResult } from "../src/types.js";

describe("renderMarkdown", () => {
  it("renders titles, bilingual sections, and vocabulary without extra headings", () => {
    const formatted: FormattingResult = {
      titleCandidates: ["标题一", "标题二", "标题三"],
      sections: [
        { english: "First English paragraph.", chinese: "第一段中文。" },
        { english: "Second English paragraph.", chinese: "第二段中文。" }
      ],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "重力" },
        { phrase: "break down", meaning: "拆解说明" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "轨道" }
      ]
    };

    const markdown = renderMarkdown(formatted);
    expect(markdown).toContain("标题一\n标题二\n标题三");
    expect(markdown).toContain("First English paragraph.\n\n第一段中文。");
    expect(markdown).toContain("Second English paragraph.\n\n第二段中文。");
    expect(markdown).toContain("·gravity n. 重力\n·break down 拆解说明\n·orbit n. 轨道");
    expect(markdown).not.toContain("##");
    expect(markdown).not.toContain("重点词汇");
  });
});
