import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateFormattingResponse,
  type GenerateJson
} from "../src/services/openai.js";

function buildVocabulary(prefix: string) {
  return [
    { phrase: `${prefix} 1`, meaning: `${prefix} meaning 1` },
    { phrase: `${prefix} 2`, partOfSpeech: "n.", meaning: `${prefix} meaning 2` },
    { phrase: `${prefix} 3`, meaning: `${prefix} meaning 3` },
    { phrase: `${prefix} 4`, meaning: `${prefix} meaning 4` }
  ];
}

describe("validateFormattingResponse", () => {
  it("accepts a valid short-format response", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      focusVocabulary: buildVocabulary("focus"),
      challengingVocabulary: buildVocabulary("hard")
    }, { requireSections: true });

    expect(result.sections).toHaveLength(1);
    expect(result.focusVocabulary).toHaveLength(4);
    expect(result.challengingVocabulary).toHaveLength(4);
  });

  it("accepts a valid non-short response without sections", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      focusVocabulary: buildVocabulary("focus"),
      challengingVocabulary: buildVocabulary("hard")
    });

    expect(result.sections).toEqual([]);
    expect(result.focusVocabulary[1].partOfSpeech).toBe("n.");
  });

  it("warns instead of throwing when vocabulary group size is outside 4 or 5", () => {
    const result = validateFormattingResponse({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
      focusVocabulary: [{ phrase: "focus", meaning: "meaning" }],
      challengingVocabulary: buildVocabulary("hard")
    }, { requireSections: true });

    expect(result.focusVocabulary).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  it("formats short content into titles, tags, sections, and two vocabulary groups", async () => {
    const generateJson: GenerateJson = async <T>(): Promise<T> => ({
      titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
      sections: [
        { english: "First English paragraph.", chinese: "First Chinese paragraph." },
        { english: "Second English paragraph.", chinese: "Second Chinese paragraph." }
      ],
      focusVocabulary: buildVocabulary("focus"),
      challengingVocabulary: buildVocabulary("hard")
    } as T);

    const result = await formatTranscript(generateJson, "Demo Video", "Demo description", "Full transcript text");
    expect(result.titleCandidates).toHaveLength(5);
    expect(result.tags).toHaveLength(5);
    expect(result.sections).toHaveLength(2);
    expect(result.focusVocabulary).toHaveLength(4);
    expect(result.challengingVocabulary).toHaveLength(4);
  });

  it("builds a short prompt with bilingual section and split vocabulary constraints", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPrompt = "";

    const generateJson: GenerateJson = async <T>(systemPrompt: string, userPrompt: string): Promise<T> => {
      capturedSystemPrompt = systemPrompt;
      capturedUserPrompt = userPrompt;

      return {
        titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        sections: [{ english: "English paragraph", chinese: "Chinese paragraph" }],
        focusVocabulary: buildVocabulary("focus"),
        challengingVocabulary: buildVocabulary("hard")
      } as T;
    };

    await formatTranscript(
      generateJson,
      "Demo Video #science #electronics",
      "Demo description https://example.com",
      "Full transcript text"
    );

    expect(capturedSystemPrompt).toContain("5 to 10 Chinese titles suitable for Xiaohongshu/Rednote");
    expect(capturedSystemPrompt).toContain("focusVocabulary must contain 4 or 5 important and relatively common");
    expect(capturedSystemPrompt).toContain("challengingVocabulary must contain 4 or 5 harder and less common");
    expect(capturedSystemPrompt).toContain("one concise natural Chinese paragraph");
    expect(capturedUserPrompt).toBe(
      "Video title: Demo Video\nVideo description: Demo description\nRespond in json only.\nTranscript:\nFull transcript text"
    );
  });

  it("builds a non-short prompt without translation or sections", async () => {
    let capturedSystemPrompt = "";

    const generateJson: GenerateJson = async <T>(systemPrompt: string): Promise<T> => {
      capturedSystemPrompt = systemPrompt;

      return {
        titleCandidates: ["Title A", "Title B", "Title C", "Title D", "Title E"],
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
        focusVocabulary: buildVocabulary("focus"),
        challengingVocabulary: buildVocabulary("hard")
      } as T;
    };

    const result = await formatTranscript(
      generateJson,
      "Demo Video",
      "Demo description",
      "Full transcript text",
      { mode: "non-short" }
    );

    expect(capturedSystemPrompt).toContain("Analyze an English subtitle transcript.");
    expect(capturedSystemPrompt).toContain("concise English titles");
    expect(capturedSystemPrompt).toContain("short English topic tags");
    expect(capturedSystemPrompt).toContain("very short English meanings");
    expect(capturedSystemPrompt).not.toContain('"sections"');
    expect(result.sections).toEqual([]);
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
        focusVocabulary: buildVocabulary("focus"),
        challengingVocabulary: buildVocabulary("hard")
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
