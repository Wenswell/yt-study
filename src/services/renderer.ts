import type { FormattingResult, RunMetadata, TranscriptChunk } from "../types.js";

export function renderMarkdown(
  metadata: RunMetadata,
  chunks: TranscriptChunk[],
  formatted: FormattingResult
): string {
  const lines: string[] = [];

  lines.push(`# ${metadata.videoTitle}`);
  lines.push("");
  lines.push("## Video Info");
  lines.push(`- Source URL: ${metadata.sourceUrl}`);
  lines.push(`- Video ID: ${metadata.videoId}`);
  lines.push(`- Subtitle Source: ${metadata.subtitleSource}`);
  lines.push(`- OpenAI Model: ${metadata.model}`);
  lines.push(`- Generated At: ${metadata.generatedAt}`);
  lines.push("");
  lines.push("## Chinese Title Ideas");
  for (const title of formatted.titleCandidates) {
    lines.push(`- ${title}`);
  }
  lines.push("");
  lines.push("## Study Notes");

  for (const chunk of chunks) {
    const item = formatted.chunks.find((entry) => entry.chunkIndex === chunk.index);
    if (!item) {
      continue;
    }

    lines.push("");
    lines.push(`### Section ${chunk.index + 1} (${formatTimestamp(chunk.startMs)} - ${formatTimestamp(chunk.endMs)})`);
    lines.push("");
    lines.push("**Original**");
    lines.push(chunk.sourceText);
    lines.push("");
    lines.push("**Chinese Translation**");
    lines.push(item.chineseTranslation);
    lines.push("");
    lines.push("**Vocabulary & Notes**");

    if (item.explanations.length === 0) {
      lines.push("- None");
    } else {
      for (const explanation of item.explanations) {
        lines.push(`- ${explanation.phrase}: ${explanation.chinese} (${explanation.note})`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

function formatTimestamp(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
