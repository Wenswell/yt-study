import type { FormattingResult } from "../types.js";

export function renderFormattedMarkdown(formatted: FormattingResult): string {
  const parts: string[] = [];

  if (formatted.titleCandidates.length > 0) {
    parts.push(...formatted.titleCandidates);
  }

  if (formatted.tags.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }

    parts.push(formatted.tags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" "));
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

  const vocabularyLines = formatted.vocabulary
    .map((item) => [`·${item.phrase.trim()}`, item.partOfSpeech?.trim(), item.meaning.trim()].filter(Boolean).join(" "))
    .filter(Boolean);

  if (vocabularyLines.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(...vocabularyLines);
  }

  return `${parts.join("\n")}\n`;
}
