import OpenAI from "openai";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { FormattingResult, StudySection, VocabularyItem } from "../types.js";

export type GenerateJson = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

type FormattingMode = "short" | "non-short";

export interface FormattingOptions {
  mode?: FormattingMode;
}

interface PromptProfile {
  taskInstruction: string;
  schema: string;
  titleInstruction: {
    default: string;
    conservative: string;
  };
  tagInstruction: {
    default: string;
    conservative: string;
  };
  sectionInstruction?: string;
  focusVocabularyInstruction: string;
  challengingVocabularyInstruction: string;
}

interface PromptAttempt {
  label: "default" | "conservative";
  systemPrompt: string;
  userPrompt: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const COMMON_PROMPT_RULES = [
  "Vocabulary items may come from the transcript, the video title, or the video description when relevant.",
  "Prefer concise phrases over full-sentence explanations.",
  "Include partOfSpeech(abbr, like v.) only when the phrase is a single English word.",
  "Keep the output neutral and educational. Do not add extra advice, procedures, or unsafe guidance.",
  "Do not output headings, labels, separators, timestamps, markdown, or extra metadata."
];

const PROMPT_PROFILES: Record<FormattingMode, PromptProfile> = {
  short: {
    taskInstruction: "Convert an English subtitle transcript into bilingual Chinese study notes.",
    schema: '{"titleCandidates":["string","string","string","string","string"],"tags":["string","string","string","string","string"],"sections":[{"english":"string","chinese":"string"}],"focusVocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}],"challengingVocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}]}.',
    titleInstruction: {
      default: "titleCandidates must contain 5 to 10 Chinese titles suitable for Xiaohongshu/Rednote and may use emoji. No need to describe/summaries content, just try to be amusing/entertaining and attractive.",
      conservative: "titleCandidates must contain 5 to 10 concise Chinese titles about the topic. No need to describe/summaries content, just try to be amusing/entertaining and attractive. Avoid sensational wording and emoji."
    },
    tagInstruction: {
      default: "tags must contain 5 to 10 short Chinese topic tags suitable for Xiaohongshu/Rednote. Return plain tag text without the leading # symbol.",
      conservative: "tags must contain 5 to 10 short Chinese topic tags for social media use. Return plain tag text without the leading # symbol."
    },
    sectionInstruction: "sections must be split into natural study chunks; each chunk needs one cleaned English paragraph that stays faithful to the transcript and one concise natural Chinese paragraph.",
    focusVocabularyInstruction: "focusVocabulary must contain 4 or 5 important and relatively common words/expressions with very short Chinese meanings.",
    challengingVocabularyInstruction: "challengingVocabulary must contain 4 or 5 harder and less common words/expressions with very short Chinese meanings."
  },
  "non-short": {
    taskInstruction: "Analyze an English subtitle transcript.",
    schema: '{"titleCandidates":["string","string","string","string","string"],"tags":["string","string","string","string","string"],"focusVocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}],"challengingVocabulary":[{"phrase":"string","partOfSpeech":"string","meaning":"string"}]}.',
    titleInstruction: {
      default: "titleCandidates must contain 5 to 10 concise English titles about the topic. Keep them attractive but neutral.",
      conservative: "titleCandidates must contain 5 to 10 concise English titles about the topic. Avoid sensational wording and emoji."
    },
    tagInstruction: {
      default: "tags must contain 5 to 10 short English topic tags for social media use. Return plain tag text without the leading # symbol.",
      conservative: "tags must contain 5 to 10 short English topic tags for social media use. Return plain tag text without the leading # symbol."
    },
    focusVocabularyInstruction: "focusVocabulary must contain 4 or 5 important and relatively common words/expressions with very short English meanings.",
    challengingVocabularyInstruction: "challengingVocabulary must contain 4 or 5 harder and less common words/expressions with very short English meanings."
  }
};

export function createOpenAiJsonClient(apiKey: string, model: string, baseURL?: string): GenerateJson {
  const client = new OpenAI({ apiKey, baseURL: baseURL || DEFAULT_BASE_URL });

  return async function generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    logger.debug("openai", `Sending request to model ${model}`);
    logLlmText("System prompt", systemPrompt);
    logLlmText("User prompt", userPrompt);

    let rawContent: string | undefined;
    try {
      rawContent = await requestJsonText(client, model, systemPrompt, userPrompt);
    } catch (error) {
      logger.error("openai", `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    logLlmText("Raw response", rawContent ?? "[empty response]");
    if (!rawContent) {
      throw new AppError("OPENAI_EMPTY", "OpenAI returned an empty response.");
    }

    return parseJsonResponse<T>(rawContent);
  };
}

export async function formatTranscript(
  generateJson: GenerateJson,
  videoTitle: string,
  description: string,
  transcriptText: string,
  options: FormattingOptions = {}
): Promise<FormattingResult> {
  const mode = options.mode ?? "short";
  logger.info("openai", `Formatting transcript into study notes (${mode})`);

  const attempts = buildPromptAttempts(
    mode,
    sanitizeTitle(videoTitle),
    sanitizeDescription(description),
    sanitizeTranscript(transcriptText)
  );

  let parsed: FormattingResult | undefined;
  let lastError: unknown;

  for (const [index, attempt] of attempts.entries()) {
    try {
      parsed = validateFormattingResponse(
        await generateJson<unknown>(attempt.systemPrompt, attempt.userPrompt),
        { requireSections: mode === "short" }
      );
      break;
    } catch (error) {
      lastError = error;

      if (!isAzureContentFilterError(error) || index === attempts.length - 1) {
        throw error;
      }

      logger.warn("openai", `Prompt was filtered on ${attempt.label} attempt. Retrying with a conservative prompt.`);
    }
  }

  if (!parsed) {
    throw lastError instanceof Error
      ? lastError
      : new AppError("OPENAI_EMPTY", "OpenAI returned an empty response.");
  }

  logger.info(
    "openai",
    `Generated ${parsed.titleCandidates.length} titles, ${parsed.tags.length} tags, ${parsed.sections.length} sections, ${parsed.focusVocabulary.length} focus vocabulary items, ${parsed.challengingVocabulary.length} challenging vocabulary items`
  );

  return parsed;
}

export function validateFormattingResponse(
  value: unknown,
  options: { requireSections?: boolean } = {}
): FormattingResult {
  if (!isRecord(value)) {
    throw new AppError("OPENAI_SCHEMA", "Formatting response must be an object.");
  }

  return {
    titleCandidates: validateTitleCandidates(value.titleCandidates),
    tags: validateTags(value.tags),
    sections: options.requireSections ? validateSections(value.sections) : validateOptionalSections(value.sections),
    focusVocabulary: validateVocabularyGroup(value.focusVocabulary, "focusVocabulary"),
    challengingVocabulary: validateVocabularyGroup(value.challengingVocabulary, "challengingVocabulary")
  };
}

function buildPromptAttempts(
  mode: FormattingMode,
  title: string,
  description: string,
  transcriptText: string
): PromptAttempt[] {
  return [
    {
      label: "default",
      systemPrompt: buildSystemPrompt(mode, false),
      userPrompt: buildUserPrompt(title, description, transcriptText)
    },
    {
      label: "conservative",
      systemPrompt: buildSystemPrompt(mode, true),
      userPrompt: buildUserPrompt(title, "", transcriptText)
    }
  ];
}

function buildSystemPrompt(mode: FormattingMode, conservative: boolean): string {
  const profile = PROMPT_PROFILES[mode];

  return [
    profile.taskInstruction,
    "Output a json object only with this shape:",
    profile.schema,
    conservative ? profile.titleInstruction.conservative : profile.titleInstruction.default,
    conservative ? profile.tagInstruction.conservative : profile.tagInstruction.default,
    profile.sectionInstruction,
    profile.focusVocabularyInstruction,
    profile.challengingVocabularyInstruction,
    ...COMMON_PROMPT_RULES
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUserPrompt(videoTitle: string, description: string, transcriptText: string): string {
  return [
    `Video title: ${videoTitle}`,
    description ? `Video description: ${description}` : "Video description: [omitted]",
    "Respond in json only.",
    "Transcript:",
    transcriptText
  ].join("\n");
}

async function requestJsonText(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | undefined> {
  try {
    return await requestViaResponses(client, model, systemPrompt, userPrompt);
  } catch (error) {
    if (!shouldFallbackToChatCompletions(error)) {
      throw error;
    }

    logger.warn("openai", `Model ${model} does not support /v1/responses. Falling back to /v1/chat/completions.`);
    return requestViaChatCompletions(client, model, systemPrompt, userPrompt);
  }
}

async function requestViaResponses(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | undefined> {
  const response = await client.responses.create({
    model,
    instructions: systemPrompt,
    input: userPrompt,
    text: {
      format: { type: "json_object" }
    }
  });

  return extractResponseText(response);
}

async function requestViaChatCompletions(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | undefined> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  return extractChatCompletionText(response);
}

function parseJsonResponse<T>(rawContent: string): T {
  try {
    return JSON.parse(rawContent) as T;
  } catch (error) {
    logger.error("openai", `Failed to parse model JSON output: ${rawContent}`);
    throw new AppError(
      "OPENAI_INVALID_JSON",
      `OpenAI returned non-JSON content: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function validateTitleCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", "Title candidates must be an array.");
  }

  const titleCandidates = normalizeStringArray(value);
  if (titleCandidates.length < 5 || titleCandidates.length > 10) {
    logger.warn("openai", `Expected 5 to 10 title candidates, received ${titleCandidates.length}.`);
  }

  return titleCandidates;
}

function validateTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", "Tags must be an array.");
  }

  const tags = normalizeStringArray(value, (item) => item.replace(/^#+/, "").trim());
  if (tags.length < 5 || tags.length > 10) {
    logger.warn("openai", `Expected 5 to 10 tags, received ${tags.length}.`);
  }

  return tags;
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

function validateOptionalSections(value: unknown): StudySection[] {
  if (typeof value === "undefined") {
    return [];
  }

  return validateSections(value);
}

function validateVocabularyGroup(value: unknown, fieldName: string): VocabularyItem[] {
  if (!Array.isArray(value)) {
    throw new AppError("OPENAI_SCHEMA", `${fieldName} must be an array.`);
  }

  const vocabulary = value.map((item) => {
    if (!isRecord(item) || typeof item.phrase !== "string" || typeof item.meaning !== "string") {
      throw new AppError("OPENAI_SCHEMA", `Each ${fieldName} item must include phrase and meaning.`);
    }

    const phrase = item.phrase.trim();
    const meaning = item.meaning.trim();
    const partOfSpeech = typeof item.partOfSpeech === "string" ? item.partOfSpeech.trim() : undefined;

    if (!phrase || !meaning) {
      throw new AppError("OPENAI_SCHEMA", `${fieldName} item content cannot be empty.`);
    }

    return { phrase, partOfSpeech, meaning };
  });

  if (vocabulary.length < 4 || vocabulary.length > 5) {
    logger.warn("openai", `Expected 4 or 5 ${fieldName} items, received ${vocabulary.length}.`);
  }

  return vocabulary;
}

function normalizeStringArray(
  value: unknown[],
  transform: (item: string) => string = (item) => item.trim()
): string[] {
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => transform(item))
    .filter(Boolean);
}

function extractResponseText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text;
  }

  if (!Array.isArray(value.output)) {
    return undefined;
  }

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

  return undefined;
}

function extractChatCompletionText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return undefined;
  }

  for (const choice of value.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const content = choice.message.content;
    if (typeof content === "string" && content.trim()) {
      return content;
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

function previewForLog(value: string, maxLength = 10240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function sanitizeTitle(value: string): string {
  return sanitizePromptText(value, { removeHashtags: false, maxLength: 200 }) || "[untitled]";
}

function sanitizeDescription(value: string): string {
  return sanitizePromptText(value, { removeHashtags: false, maxLength: 400 });
}

function sanitizeTranscript(value: string): string {
  return sanitizePromptText(value, { removeHashtags: false, maxLength: 12000 }) || value.trim();
}

function sanitizePromptText(
  value: string,
  options: { removeHashtags: boolean; maxLength: number }
): string {
  let sanitized = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ");

  if (options.removeHashtags) {
    sanitized = sanitized.replace(/#[^\s#]+/g, " ");
  }

  sanitized = sanitized.replace(/\s+/g, " ").trim();
  if (!sanitized) {
    return "";
  }

  if (sanitized.length <= options.maxLength) {
    return sanitized;
  }

  return sanitized.slice(0, options.maxLength).trim();
}

function isAzureContentFilterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("content management policy") || normalized.includes("content filter");
}

function shouldFallbackToChatCompletions(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return message.includes("/v1/responses") && (
    message.includes("\u4e0d\u652f\u6301") ||
    normalized.includes("not support") ||
    normalized.includes("unsupported") ||
    normalized.includes("does not support") ||
    normalized.includes("api path")
  );
}
