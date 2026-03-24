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
    logLlmText("System prompt", systemPrompt);
    logLlmText("User prompt", userPrompt);

    let response;
    try {
      response = await client.responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        text: {
          format: { type: "json_object" }
        }
      });
    } catch (error) {
      logger.error("openai", `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    const content = extractResponseText(response);
    logLlmText("Raw response", content ?? "[empty response]");
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
    "Convert an English subtitle transcript into bilingual Chinese study notes.",
    "Output a json object only with this shape:",
    '{"titleCandidates":["string","string","string","string","string"],"sections":[{"english":"string","chinese":"string"}],"vocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}]}.',
    "titleCandidates must contain 5 to 10 Chinese titles suitable for Xiaohongshu/Rednote and may use emoji.",
    "sections must be split into natural study chunks; each chunk needs one cleaned English paragraph that stays faithful to the transcript and one concise natural Chinese paragraph.",
    "vocabulary must contain exactly 3 or 4 difficult or important words/expressions with Chinese meanings.",
    "Include partOfSpeech only when the phrase is a single English word.",
    "Do not output headings, labels, separators, timestamps, markdown, or extra metadata."
  ].join(" ");
}

function formattingUserPrompt(videoTitle: string, transcriptText: string): string {
  return [
    `Video title: ${videoTitle}`,
    "Respond in json only.",
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

  if (titleCandidates.length < 5 || titleCandidates.length > 10) {
    logger.warn("openai", `Expected 5 to 10 title candidates, received ${titleCandidates.length}.`);
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
    logger.warn("openai", `Expected 3 or 4 vocabulary items, received ${vocabulary.length}.`);
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

function logLlmText(label: string, value: string): void {
  logger.info("openai", `${label} (${value.length} chars): ${previewForLog(value)}`);
  logger.debug("openai", `${label} full:\n${value}`);
}

function previewForLog(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}
