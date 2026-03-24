import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateFormattingResponse,
  type GenerateJson
} from "../src/services/openai.js";

describe("validateFormattingResponse", () => {
  it("accepts a valid formatting response", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
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

  it("warns instead of throwing when title count falls outside 5 to 10", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    });

    expect(result.titleCandidates).toEqual(["Title A", "Title B"]);
  });

  it("warns instead of throwing when tag count falls outside 5 to 10", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [
        { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
        { phrase: "break down", meaning: "explain step by step" },
        { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
      ]
    });

    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("warns instead of throwing when vocabulary count is outside 3 or 4", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      vocabulary: [{ phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" }]
    });

    expect(result.vocabulary).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  it("formats a transcript into titles, tags, sections, and vocabulary", async () => {
    const generateJson: GenerateJson = async <T>(): Promise<T> => ({
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
    } as T);

    const result = await formatTranscript(generateJson, "Demo Video", "Demo description", "Full transcript text");
    expect(result.titleCandidates).toHaveLength(5);
    expect(result.tags).toHaveLength(5);
    expect(result.sections).toHaveLength(2);
    expect(result.vocabulary[0].partOfSpeech).toBe("n.");
  });

  it("builds a concise prompt with aligned title, tag, and vocabulary constraints", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPrompt = "";

    const generateJson: GenerateJson = async <T>(systemPrompt: string, userPrompt: string): Promise<T> => {
      capturedSystemPrompt = systemPrompt;
      capturedUserPrompt = userPrompt;

      return {
        titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
        vocabulary: [
          { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
          { phrase: "break down", meaning: "explain step by step" },
          { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
        ]
      } as T;
    };

    await formatTranscript(
      generateJson,
      "Demo Video #science #electronics",
      "Demo description https://example.com",
      "Full transcript text"
    );

    expect(capturedSystemPrompt).toContain("5 to 10 Chinese titles suitable for Xiaohongshu/Rednote");
    expect(capturedSystemPrompt).toContain("5 to 10 short Chinese topic tags suitable for Xiaohongshu/Rednote");
    expect(capturedSystemPrompt).toContain("very short Chinese meanings");
    expect(capturedSystemPrompt).toContain("Do not add extra advice, procedures, or unsafe guidance.");
    expect(capturedSystemPrompt).toContain("Do not output headings, labels, separators");
    expect(capturedUserPrompt).toBe(
      "Video title: Demo Video\nVideo description: Demo description\nRespond in json only.\nTranscript:\nFull transcript text"
    );
  });

  it("retries with a conservative prompt when Azure content filtering rejects the first prompt", async () => {
    const attempts: Array<{ systemPrompt: string; userPrompt: string }> = [];

    const generateJson: GenerateJson = async <T>(systemPrompt: string, userPrompt: string): Promise<T> => {
      attempts.push({ systemPrompt, userPrompt });

      if (attempts.length === 1) {
        throw new Error("400 The response was filtered due to the prompt triggering Azure OpenAI's content management policy.");
      }

      return {
        titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
        vocabulary: [
          { phrase: "gravity", partOfSpeech: "n.", meaning: "gravity-cn" },
          { phrase: "break down", meaning: "explain step by step" },
          { phrase: "orbit", partOfSpeech: "n.", meaning: "orbit-cn" }
        ]
      } as T;
    };

    const result = await formatTranscript(
      generateJson,
      "Mercury Switch #science",
      "Watch more at https://example.com",
      "Full transcript text"
    );

    expect(result.titleCandidates).toHaveLength(5);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].systemPrompt).toContain("Xiaohongshu/Rednote");
    expect(attempts[1].systemPrompt).toContain("Avoid sensational wording and emoji");
    expect(attempts[1].systemPrompt).not.toContain("Xiaohongshu/Rednote");
    expect(attempts[1].userPrompt).toContain("Video description: [omitted]");
  });
});
