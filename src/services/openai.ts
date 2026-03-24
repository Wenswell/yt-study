import OpenAI from "openai";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type {
  FormattingResult,
  StudySection,
  VocabularyItem
} from "../types.js";

export type GenerateJson = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

export function createOpenAiJsonClient(apiKey: string, model: string, baseURL?: string): GenerateJson {
  const client = new OpenAI({ apiKey, baseURL: baseURL || "https://api.openai.com/v1" });

  return async function generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    logger.debug("openai", `Sending request to model ${model}`);
    const jsonPrompt = `Return JSON only.\n\n${userPrompt}`;

    const response = await client.responses.create({
      model,
      instructions: systemPrompt,
      input: jsonPrompt,
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
  videoTitle: string,
  transcriptText: string
): Promise<FormattingResult> {
  logger.info("openai", "Formatting transcript into study notes");
  const parsed = validateFormattingResponse(
    await generateJson<unknown>(
      formattingSystemPrompt(),
      formattingUserPrompt(videoTitle, transcriptText)
    )
  );

  logger.info(
    "openai",
    `Generated ${parsed.titleCandidates.length} titles, ${parsed.sections.length} sections, ${parsed.vocabulary.length} vocabulary items`
  );
  return parsed;
}

function formattingSystemPrompt(): string {
  return [
    "You rewrite an English subtitle transcript into bilingual study notes in Chinese.",
    "Decide where to split the transcript into natural study sections.",
    "Each section must contain one English paragraph and one Chinese paragraph.",
    "Do not include metadata, headings, separators, timestamps, or labels.",
    "Also extract 3 or 4 difficult or important words/expressions.",
    "For a single English word, include its part of speech.",
    "For a phrase or expression, partOfSpeech can be omitted.",
    'JSON shape: {"titleCandidates":["string","string","string"],"sections":[{"english":"string","chinese":"string"}],"vocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}]}'
  ].join(" ");
}

function formattingUserPrompt(videoTitle: string, transcriptText: string): string {
  return [
    `Video title: ${videoTitle}`,
    "Task:",
    "1. Generate 3 or more alternative Chinese titles(you can use emoji, targeted platform: Xiaohongshu/rednote).",
    "2. Organize the transcript into natural bilingual sections.",
    "3. Output exactly 3 or 4 difficult vocabulary items or expressions.",
    "4. Keep the English faithful to the transcript while cleaning subtitle noise.",
    "5. Keep the Chinese natural and concise.",
    "",
    "Transcript:",
    transcriptText
  ].join("\n");
}

export function validateFormattingResponse(value: unknown): FormattingResult {
  if (!isRecord(value)) {
    throw new AppError("OPENAI_SCHEMA", "Formatting response must be an object.");
  }

  const titleCandidates = validateTitleCandidates(value.titleCandidates);
  const sections = validateSections(value.sections);
  const vocabulary = validateVocabulary(value.vocabulary);

  return {
    titleCandidates,
    sections,
    vocabulary
  };
}

function validateTitleCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", "Title candidates must be an array.");
  }

  const titleCandidates = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (titleCandidates.length !== 3) {
    throw new AppError("OPENAI_SCHEMA", "Expected exactly 3 title candidates.");
  }

  return titleCandidates;
}

function validateSections(value: unknown): StudySection[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", "Sections must be an array.");
  }

  const sections = value.map((item) => {
    if (!isRecord(item) || typeof item.english !== "string" || typeof item.chinese !== "string") {
      throw new AppError("OPENAI_SCHEMA", "Each section must include english and chinese strings.");
    }

    const english = item.english.trim();
    const chinese = item.chinese.trim();
    if (!english || !chinese) {
      throw new AppError("OPENAI_SCHEMA", "Section content cannot be empty.");
    }

    return { english, chinese };
  });

  if (sections.length === 0) {
    throw new AppError("OPENAI_SCHEMA", "Expected at least 1 study section.");
  }

  return sections;
}

function validateVocabulary(value: unknown): VocabularyItem[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", "Vocabulary must be an array.");
  }

  const vocabulary = value.map((item) => {
    if (!isRecord(item) || typeof item.phrase !== "string" || typeof item.meaning !== "string") {
      throw new AppError("OPENAI_SCHEMA", "Each vocabulary item must include phrase and meaning.");
    }

    const phrase = item.phrase.trim();
    const meaning = item.meaning.trim();
    const partOfSpeech = typeof item.partOfSpeech === "string" ? item.partOfSpeech.trim() : undefined;

    if (!phrase || !meaning) {
      throw new AppError("OPENAI_SCHEMA", "Vocabulary item content cannot be empty.");
    }

    return { phrase, partOfSpeech, meaning };
  });

  if (vocabulary.length < 3 || vocabulary.length > 4) {
    throw new AppError("OPENAI_SCHEMA", "Expected 3 or 4 vocabulary items.");
  }

  return vocabulary;
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
