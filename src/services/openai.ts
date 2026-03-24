import OpenAI from "openai";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type {
  ExplanationItem,
  FormattedChunk,
  FormattingResult,
  TranscriptChunk
} from "../types.js";

export type GenerateJson = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

export function createOpenAiJsonClient(apiKey: string, model: string, baseURL?: string): GenerateJson {
  const client = new OpenAI({ apiKey, baseURL: baseURL || "https://api.openai.com/v1" });

  return async function generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    logger.debug("openai", `Sending request to model ${model}`);

    const response = await client.responses.create({
      model,
      instructions: systemPrompt,
      input: userPrompt,
      text: {
        format: { type: "json_object" }
      }
    });

    const content = extractResponseText(response);
    if (!content) {
      throw new AppError("OPENAI_EMPTY", "OpenAI returned an empty response.");
    }

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error("openai", `Failed to parse model JSON output: ${content}`);
      throw new AppError(
        "OPENAI_INVALID_JSON",
        `OpenAI returned non-JSON content: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

export async function formatTranscript(
  generateJson: GenerateJson,
  chunks: TranscriptChunk[]
): Promise<FormattingResult> {
  logger.info("openai", `Formatting ${chunks.length} transcript chunks`);
  const formattedChunks: FormattedChunk[] = [];

  for (const chunk of chunks) {
    logger.info("openai", `Formatting chunk ${chunk.index + 1}/${chunks.length}`);
    const parsed = validateChunkResponse(
      await generateJson<unknown>(
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
    await generateJson<unknown>(
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

function extractResponseText(value: unknown): string | undefined {
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

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
