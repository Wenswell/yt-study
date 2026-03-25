import { describe, expect, it } from "vitest";
import { renderFormattedMarkdown } from "../src/services/renderer.js";

describe("renderFormattedMarkdown", () => {
  it("renders short-form markdown with focus vocabulary before challenging vocabulary", () => {
    const markdown = renderFormattedMarkdown(
      {
        formats: [{ acodec: "", ext: "", format_id: "", vcodec: "" }],
        id: "video123",
        fulltitle: "Demo",
        webpage_url: "https://example.com",
        media_type: "short",
        uploader_id: "@demo"
      },
      {
        titleCandidates: ["Title 1", "Title 2"],
        tags: ["tag1", "#tag2"],
        sections: [
          { english: "English A", chinese: "中文A" },
          { english: "English B", chinese: "中文B" }
        ],
        focusVocabulary: [
          { phrase: "gravity", partOfSpeech: "n.", meaning: "重力" },
          { phrase: "force", meaning: "力" }
        ],
        challengingVocabulary: [
          { phrase: "orbital decay", meaning: "轨道衰减" },
          { phrase: "periapsis", meaning: "近拱点" }
        ]
      }
    );

    expect(markdown).toBe(
      "YouTube@demo\nFrom YT@ demo\n\nTitle 1\nTitle 2\n\n重点词汇\n• gravity n. 重力\n• force 力\n\n难点词汇\n• orbital decay 轨道衰减\n• periapsis 近拱点\n\n#tag1 #tag2\n\nEnglish A\n\nEnglish B\n\nEnglish A\n\n中文A\n\nEnglish B\n\n中文B\n"
    );
  });

  it("renders transcript paragraph at the end for non-short content", () => {
    const markdown = renderFormattedMarkdown(
      {
        formats: [{ acodec: "", ext: "", format_id: "", vcodec: "" }],
        id: "video123",
        fulltitle: "Demo",
        webpage_url: "https://example.com",
        media_type: "video",
        uploader_id: "@demo"
      },
      {
        titleCandidates: ["Title 1"],
        tags: ["tag1"],
        sections: [],
        focusVocabulary: [
          { phrase: "gravity", meaning: "gravity" },
          { phrase: "force", meaning: "force" }
        ],
        challengingVocabulary: [
          { phrase: "orbital decay", meaning: "orbital decay" }
        ],
        transcriptParagraph: "This is the merged transcript paragraph."
      }
    );

    expect(markdown).toBe(
      "YouTube@demo\nFrom YT@ demo\n\nTitle 1\n\n重点词汇\n• gravity gravity\n• force force\n\n难点词汇\n• orbital decay orbital decay\n\n#tag1\n\nThis is the merged transcript paragraph.\n"
    );
  });
});
