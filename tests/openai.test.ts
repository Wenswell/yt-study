import { describe, expect, it } from "vitest";
import {
  formatTranscript,
  validateChunkResponse,
  validateTitleResponse,
  type LlmClient
} from "../src/services/openai.js";
import type { TranscriptChunk } from "../src/types.js";

describe("validateChunkResponse", () => {
  it("accepts valid chunk responses", () => {
    const result = validateChunkResponse({
      chineseTranslation: "测试",
      explanations: [{ phrase: "demo", chinese: "示例", note: "常用词" }]
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
  it("formats transcript and title results with a mocked llm", async () => {
    const llm: LlmClient = {
      async generateJson<T>(_systemPrompt: string, userPrompt: string): Promise<T> {
        if (userPrompt.startsWith("Transcript preview")) {
          return { titleCandidates: ["标题一", "标题二", "标题三"] } as T;
        }

        return {
          chineseTranslation: "中文翻译",
          explanations: [{ phrase: "term", chinese: "术语", note: "解释" }]
        } as T;
      }
    };

    const chunks: TranscriptChunk[] = [{
      index: 0,
      startMs: 0,
      endMs: 1000,
      sourceText: "English source",
      segments: []
    }];

    const result = await formatTranscript(llm, chunks);
    expect(result.titleCandidates).toHaveLength(3);
    expect(result.chunks[0].chineseTranslation).toBe("中文翻译");
  });
});
