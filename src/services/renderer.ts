import type { FormattingResult } from "../types.js";

export function renderMarkdown(formatted: FormattingResult): string {
  const lines: string[] = [];

  lines.push(...formatted.titleCandidates);
  lines.push("");
  lines.push(formatted.tags.map((tag) => `#${tag}`).join(" "));
  lines.push("");

  for (const section of formatted.sections) {
    lines.push(section.english);
    lines.push("");
    lines.push(section.chinese);
    lines.push("");
  }

  for (const item of formatted.vocabulary) {
    const parts = [`·${item.phrase}`];
    if (item.partOfSpeech) {
      parts.push(item.partOfSpeech);
    }
    parts.push(item.meaning);
    lines.push(parts.join(" "));
  }

  return lines.join("\n").trimEnd() + "\n";
}
