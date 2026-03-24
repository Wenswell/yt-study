import OpenAI from "openai";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type {
  ExplanationItem,
  FormattedChunk,
  FormattingResult,
  TranscriptChunk
} from "../types.js";

export interface LlmClient {
  generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T>;
}

export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseURL || "https://api.openai.com/v1" });
    this.model = model;
  }

  async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    logger.debug("openai", `Sending request to model ${this.model}`);
    const content = await this.generateJsonText(systemPrompt, userPrompt);

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error("openai", `Failed to parse model JSON output: ${content}`);
      throw new AppError(
        "OPENAI_INVALID_JSON",
        `OpenAI returned non-JSON content: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async generateJsonText(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: systemPrompt,
        input: userPrompt,
        text: {
          format: { type: "json_object" }
        }
      });

      const content = extractTextFromModelResponse(response);
      if (content) {
        return content;
      }

      logger.warn("openai", "Responses API returned no text output, falling back to chat completions");
    } catch (error) {
      logger.warn(
        "openai",
        `Responses API request failed, falling back to chat completions: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const content = extractTextFromModelResponse(completion);
    if (!content) {
      throw new AppError("OPENAI_EMPTY", "OpenAI returned an empty response.");
    }

    return content;
  }
}

export async function formatTranscript(
  llm: LlmClient,
  chunks: TranscriptChunk[]
): Promise<FormattingResult> {
  logger.info("openai", `Formatting ${chunks.length} transcript chunks`);
  const formattedChunks: FormattedChunk[] = [];

  for (const chunk of chunks) {
    logger.info("openai", `Formatting chunk ${chunk.index + 1}/${chunks.length}`);
    const parsed = validateChunkResponse(
      await llm.generateJson<unknown>(
        chunkSystemPrompt(),
        chunkUserPrompt(chunk)
      )
    );

    formattedChunks.push({
      chunkIndex: chunk.index,
      sourceText: chunk.sourceText,
      chineseTranslation: parsed.chineseTranslation,
      explanations: parsed.explanations
    });
  }

  const titleResponse = validateTitleResponse(
    await llm.generateJson<unknown>(
      titleSystemPrompt(),
      titleUserPrompt(chunks)
    )
  );

  logger.info("openai", `Generated ${titleResponse.titleCandidates.length} Chinese title candidates`);
  return {
    titleCandidates: titleResponse.titleCandidates,
    chunks: formattedChunks
  };
}

function chunkSystemPrompt(): string {
  return [
    "You format English subtitle chunks into Chinese study notes.",
    "Return JSON only.",
    "Translate the chunk into natural Chinese.",
    "Extract up to 5 important words or phrases and explain them in Chinese.",
    'JSON shape: {"chineseTranslation":"string","explanations":[{"phrase":"string","chinese":"string","note":"string"}]}'
  ].join(" ");
}

function chunkUserPrompt(chunk: TranscriptChunk): string {
  return [
    `Section ${chunk.index + 1}`,
    `Time: ${chunk.startMs}-${chunk.endMs}`,
    "English transcript:",
    chunk.sourceText
  ].join("\n");
}

function titleSystemPrompt(): string {
  return [
    "You create concise Chinese title ideas for an educational video.",
    "Return JSON only.",
    'JSON shape: {"titleCandidates":["string","string","string"]}',
    "Produce 3 to 5 distinct title ideas."
  ].join(" ");
}

function titleUserPrompt(chunks: TranscriptChunk[]): string {
  const preview = chunks
    .slice(0, 6)
    .map((chunk) => chunk.sourceText)
    .join("\n");

  return `Transcript preview:\n${preview}`;
}

export function validateChunkResponse(value: unknown): {
  chineseTranslation: string;
  explanations: ExplanationItem[];
} {
  if (!isRecord(value) || typeof value.chineseTranslation !== "string" || !Array.isArray(value.explanations)) {
    throw new AppError("OPENAI_SCHEMA", "Chunk response does not match the expected schema.");
  }

  const explanations = value.explanations.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.phrase !== "string" ||
      typeof item.chinese !== "string" ||
      typeof item.note !== "string"
    ) {
      throw new AppError("OPENAI_SCHEMA", "Chunk explanation schema is invalid.");
    }

    return {
      phrase: item.phrase,
      chinese: item.chinese,
      note: item.note
    };
  });

  return {
    chineseTranslation: value.chineseTranslation,
    explanations
  };
}

export function validateTitleResponse(value: unknown): {
  titleCandidates: string[];
} {
  if (!isRecord(value) || !Array.isArray(value.titleCandidates)) {
    throw new AppError("OPENAI_SCHEMA", "Title response does not match the expected schema.");
  }

  const titleCandidates = value.titleCandidates.filter((item): item is string => typeof item === "string");
  if (titleCandidates.length < 3) {
    throw new AppError("OPENAI_SCHEMA", "Expected at least 3 title candidates.");
  }

  return {
    titleCandidates
  };
}

export function extractTextFromModelResponse(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text;
  }

  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        continue;
      }

      for (const content of item.content) {
        if (isRecord(content) && typeof content.text === "string" && content.text.trim()) {
          return content.text;
        }
      }
    }
  }

  if (Array.isArray(value.choices)) {
    const choice = value.choices?.[0];
    if (isRecord(choice) && isRecord(choice.message)) {
      const content = choice.message.content;
      if (typeof content === "string" && content.trim()) {
        return content;
      }

      if (Array.isArray(content)) {
        const textParts = content
          .map((part) => {
            if (!isRecord(part)) {
              return "";
            }

            if (typeof part.text === "string") {
              return part.text;
            }

            if (isRecord(part.text) && typeof part.text.value === "string") {
              return part.text.value;
            }

            return "";
          })
          .filter(Boolean);

        if (textParts.length > 0) {
          return textParts.join("");
        }
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
