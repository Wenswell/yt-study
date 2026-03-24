import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateFormattingResponse,
  type GenerateJson
} from "../src/services/openai.js";

describe("validateFormattingResponse", () => {
  it("accepts a valid formatting response", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    });

    expect(result.sections).toHaveLength(1);
    expect(result.vocabulary).toHaveLength(3);
  });

  it("warns instead of throwing when title count differs from 3", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    });

    expect(result.titleCandidates).toEqual(["Title A", "Title B"]);
  });

  it("warns instead of throwing when vocabulary count is outside 3 or 4", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [{ phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" }]
    });

    expect(result.vocabulary).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  it("formats a transcript into titles, sections, and vocabulary", async () => {
    const generateJson: GenerateJson = async <T>(): Promise<T> => ({
      titleCandidates: ["Title A", "Title B", "Title C"],
      sections: [
        { english: "First English paragraph.", chinese: "First Chinese paragraph." },
        { english: "Second English paragraph.", chinese: "Second Chinese paragraph." }
      ],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    } as T);

    const result = await formatTranscript(generateJson, "Demo Video", "Full transcript text");
    expect(result.titleCandidates).toHaveLength(3);
    expect(result.sections).toHaveLength(2);
    expect(result.vocabulary[0].partOfSpeech).toBe("n.");
  });

  it("builds a concise prompt with aligned title and vocabulary constraints", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPrompt = "";

    const generateJson: GenerateJson = async <T>(systemPrompt: string, userPrompt: string): Promise<T> => {
      capturedSystemPrompt = systemPrompt;
      capturedUserPrompt = userPrompt;

      return {
        titleCandidates: ["Title A", "Title B", "Title C"],
        sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
        vocabulary: [
          { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
          { phrase: "break down", meaning: "explain step by step" },
          { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
        ]
      } as T;
    };

    await formatTranscript(generateJson, "Demo Video", "Full transcript text");

    expect(capturedSystemPrompt).toContain("5 to 10 Chinese titles suitable for Xiaohongshu/Rednote");
    expect(capturedSystemPrompt).toContain("exactly 3 or 4 difficult or important words/expressions");
    expect(capturedSystemPrompt).toContain("Do not output headings, labels, separators");
    expect(capturedUserPrompt).toBe("Video title: Demo Video\nRespond in json only.\nTranscript:\nFull transcript text");
  });
});
