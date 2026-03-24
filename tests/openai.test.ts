import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateChunkResponse,
  validateTitleResponse,
  type GenerateJson
} from "../src/services/openai.js";
import type { TranscriptChunk } from "../src/types.js";

describe("validateChunkResponse", () => {
  it("accepts valid chunk responses", () => {
    const result = validateChunkResponse({
      chineseTranslation: "translated text",
      explanations: [{ phrase: "demo", chinese: "demo-cn", note: "common term" }]
    });

    expect(result.explanations).toHaveLength(1);
  });

  it("rejects invalid chunk responses", () => {
    expect(() => validateChunkResponse({ foo: "bar" })).toThrow(/expected schema/i);
  });
});

describe("validateTitleResponse", () => {
  it("requires at least 3 titles", () => {
    expect(() => validateTitleResponse({ titleCandidates: ["a", "b"] })).toThrow(/at least 3/i);
  });
});

describe("formatTranscript", () => {
  it("formats transcript and title results with a mocked generator", async () => {
    const generateJson: GenerateJson = async <T>(_systemPrompt: string, userPrompt: string): Promise<T> => {
      if (userPrompt.startsWith("Transcript preview")) {
        return { titleCandidates: ["title one", "title two", "title three"] } as T;
      }

      return {
        chineseTranslation: "translated text",
        explanations: [{ phrase: "term", chinese: "term-cn", note: "explanation" }]
      } as T;
    };

    const chunks: TranscriptChunk[] = [{
      index: 0,
      startMs: 0,
      endMs: 1000,
      sourceText: "English source",
      segments: []
    }];

    const result = await formatTranscript(generateJson, chunks);
    expect(result.titleCandidates).toHaveLength(3);
    expect(result.chunks[0].chineseTranslation).toBe("translated text");
    expect(result.chunks[0]).not.toHaveProperty("sourceText");
  });
});
