import type { FormattingResult, VideoMetadata, VocabularyItem } from "../types.js";

export function renderFormattedMarkdown(metadata: VideoMetadata, formatted: FormattingResult): string {
  const parts: string[] = [];

  if (metadata.uploader_id) {
    parts.push("YouTube" + metadata.uploader_id);
    parts.push("From YT" + metadata.uploader_id.replace(/^@/, "@ "));
    parts.push("");
  }

  if (formatted.titleCandidates.length > 0) {
    parts.push(...formatted.titleCandidates);
  }

  const vocabularyGroups = resolveVocabularyGroups(formatted);
  appendVocabularyGroup(parts, "重点词汇", vocabularyGroups.focusVocabulary);
  appendVocabularyGroup(parts, "难点词汇", vocabularyGroups.challengingVocabulary);

  if (formatted.tags.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }

    parts.push(formatted.tags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" "));
  }

  const transcriptParagraph = formatted.transcriptParagraph?.trim();
  if (transcriptParagraph) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(transcriptParagraph);
    return `${parts.join("\n")}\n`;
  }

  const englishOnlyLines = formatted.sections
    .map((section) => section.english.trim())
    .filter(Boolean);

  if (englishOnlyLines.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(...englishOnlyLines.flatMap((line, index) => (index === 0 ? [line] : ["", line])));
  }

  for (const section of formatted.sections) {
    const english = section.english.trim();
    const chinese = section.chinese.trim();

    if (english) {
      if (parts.length > 0) {
        parts.push("");
      }
      parts.push(english);
    }

    if (chinese) {
      if (parts.length > 0) {
        parts.push("");
      }
      parts.push(chinese);
    }
  }

  return `${parts.join("\n")}\n`;
}

function appendVocabularyGroup(parts: string[], label: string, vocabulary: VocabularyItem[]): void {
  const vocabularyLines = vocabulary
    .map((item) => [`• ${item.phrase.trim()}`, item.partOfSpeech?.trim(), item.meaning.trim()].filter(Boolean).join(" "))
    .filter(Boolean);

  if (vocabularyLines.length === 0) {
    return;
  }

  if (parts.length > 0) {
    parts.push("");
  }

  parts.push(label);
  parts.push(...vocabularyLines);
}

function resolveVocabularyGroups(formatted: FormattingResult): {
  focusVocabulary: VocabularyItem[];
  challengingVocabulary: VocabularyItem[];
} {
  const focusVocabulary = formatted.focusVocabulary ?? [];
  const challengingVocabulary = formatted.challengingVocabulary ?? [];

  if (focusVocabulary.length > 0 || challengingVocabulary.length > 0) {
    return {
      focusVocabulary,
      challengingVocabulary
    };
  }

  const legacyVocabulary = formatted.vocabulary ?? [];
  const splitIndex = Math.ceil(legacyVocabulary.length / 2);

  return {
    focusVocabulary: legacyVocabulary.slice(0, splitIndex),
    challengingVocabulary: legacyVocabulary.slice(splitIndex)
  };
}
