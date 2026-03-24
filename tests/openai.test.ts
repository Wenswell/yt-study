import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateFormattingResponse,
  type GenerateJson
} from "../src/services/openai.js";

describe("validateFormattingResponse", () => {
  it("accepts a valid formatting response", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["标题一", "标题二", "标题三"],
      sections: [{ english: "English paragraph", chinese: "中文段落" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "重力" },
        { phrase: "break down", meaning: "拆解说明" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "轨道" }
      ]
    });

    expect(result.sections).toHaveLength(1);
    expect(result.vocabulary).toHaveLength(3);
  });

  it("rejects responses without exactly 3 titles", () => {
    expect(() => validateFormattingResponse({
      titleCandidates: ["标题一", "标题二"],
      sections: [{ english: "English paragraph", chinese: "中文段落" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "重力" },
        { phrase: "break down", meaning: "拆解说明" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "轨道" }
      ]
    })).toThrow(/exactly 3 title/i);
  });

  it("rejects responses without 3 or 4 vocabulary items", () => {
    expect(() => validateFormattingResponse({
      titleCandidates: ["标题一", "标题二", "标题三"],
      sections: [{ english: "English paragraph", chinese: "中文段落" }],
      vocabulary: [{ phrase: "gravity", partOfSpeech: "n.", meaning: "重力" }]
    })).toThrow(/3 or 4 vocabulary/i);
  });
});

describe("formatTranscript", () => {
  it("formats a transcript into titles, sections, and vocabulary", async () => {
    const generateJson: GenerateJson = async <T>(): Promise<T> => ({
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
    } as T);

    const result = await formatTranscript(generateJson, "Demo Video", "Full transcript text");
    expect(result.titleCandidates).toHaveLength(3);
    expect(result.sections).toHaveLength(2);
    expect(result.vocabulary[0].partOfSpeech).toBe("n.");
  });
});
