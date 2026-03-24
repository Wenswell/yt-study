import { describe, expect, it } from "vitest";
import { renderFormattedMarkdown } from "../src/services/renderer.js";

describe("renderFormattedMarkdown", () => {
  it("renders titles, tags, sections, vocabulary, and trailing english-only sections", () => {
    const markdown = renderFormattedMarkdown(
      {
        formats: [{ acodec: '', ext: '', format_id: '', vcodec: '' }],
        id: '',
        fulltitle: '',
        webpage_url: '',
        uploader_id: '@作者',
      }
      , {
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
      "YouTube@作者\nYT@作者\n\n标题1\n标题2\n\n·gravity 重力\n·orbit n. 轨道\n\n#标签1 #标签2\n\nEnglish A\n\nEnglish B\n\nEnglish A\n\n中文A\n\nEnglish B\n\n中文B\n"
    );
  });
});
