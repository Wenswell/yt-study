import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/services/renderer.js";
import type { FormattingResult } from "../src/types.js";

describe("renderMarkdown", () => {
  it("renders titles, tags, bilingual sections, and vocabulary without extra headings", () => {
    const formatted: FormattingResult = {
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [
        { english: "First English paragraph.", chinese: "First Chinese paragraph." },
        { english: "Second English paragraph.", chinese: "Second Chinese paragraph." }
      ],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    };

    const markdown = renderMarkdown(formatted);
    expect(markdown).toContain("Title A\nTitle B\nTitle C\nTitle D\nTitle E");
    expect(markdown).toContain("#tag1 #tag2 #tag3 #tag4 #tag5");
    expect(markdown).toContain("First English paragraph.\n\nFirst Chinese paragraph.");
    expect(markdown).toContain("Second English paragraph.\n\nSecond Chinese paragraph.");
    expect(markdown).toContain("è·¯gravity n. gravity-cn\nè·¯break down explain step by step\nè·¯orbit n. orbit-cn");
    expect(markdown).not.toContain("##");
  });
});
