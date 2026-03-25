import { beforeEach, describe, expect, it, vi } from "vitest";

const responsesCreate = vi.fn();
const chatCompletionsCreate = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = {
      create: responsesCreate
    };

    chat = {
      completions: {
        create: chatCompletionsCreate
      }
    };
  }
}));

describe("createOpenAiJsonClient", () => {
  beforeEach(() => {
    responsesCreate.mockReset();
    chatCompletionsCreate.mockReset();
  });

  it("falls back to chat completions when responses API is unsupported", async () => {
    responsesCreate.mockRejectedValue(new Error("503 model does not support this API path [/v1/responses]"));
    chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"ok":true}'
          }
        }
      ]
    });

    const { createOpenAiJsonClient } = await import("../src/services/openai.js");
    const generateJson = createOpenAiJsonClient("test-key", "gemini-3.1-flash-lite-preview-thinking-medium");
    const result = await generateJson<{ ok: boolean }>("system prompt", "user prompt");

    expect(result).toEqual({ ok: true });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(chatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(chatCompletionsCreate).toHaveBeenCalledWith({
      model: "gemini-3.1-flash-lite-preview-thinking-medium",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" }
      ],
      response_format: { type: "json_object" }
    });
  });

  it("does not fall back for unrelated responses errors", async () => {
    responsesCreate.mockRejectedValue(new Error("401 unauthorized"));

    const { createOpenAiJsonClient } = await import("../src/services/openai.js");
    const generateJson = createOpenAiJsonClient("test-key", "demo-model");

    await expect(generateJson("system prompt", "user prompt")).rejects.toThrow("401 unauthorized");
    expect(chatCompletionsCreate).not.toHaveBeenCalled();
  });
});
