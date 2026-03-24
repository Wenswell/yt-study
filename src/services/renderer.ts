import type { FormattingResult, VideoMetadata } from "../types.js";

export function renderFormattedMarkdown(metadata: VideoMetadata, formatted: FormattingResult): string {
  const parts: string[] = [];

  if (metadata.uploader_id) {
    parts.push("YouTube" + metadata.uploader_id)
    parts.push("YT" + metadata.uploader_id)
    parts.push("")
  }

  console.log('metadata',metadata)
  console.log('formatted',formatted)

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

  const englishOnlyLines = formatted.sections
    .map((section) => section.english.trim())
    .filter(Boolean);

  if (englishOnlyLines.length > 0) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(...englishOnlyLines.flatMap((line, index) => (index === 0 ? [line] : ["", line])));
  }

  return `${parts.join("\n")}\n`;
}
