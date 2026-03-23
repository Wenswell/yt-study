import { AppError } from "../lib/errors.js";
import type { SubtitleSegment, TranscriptChunk } from "../types.js";

export function parseSubtitleFile(content: string): SubtitleSegment[] {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new AppError("EMPTY_SUBTITLE", "Subtitle file is empty.");
  }

  if (trimmed.startsWith("WEBVTT")) {
    return parseVtt(trimmed);
  }

  return parseSrt(trimmed);
}

export function createTranscriptChunks(
  segments: SubtitleSegment[],
  maxCharacters = 1800
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: SubtitleSegment[] = [];
  let currentLength = 0;

  for (const segment of segments) {
    const nextLength = currentLength + segment.text.length + 1;
    if (current.length > 0 && nextLength > maxCharacters) {
      chunks.push(toChunk(chunks.length, current));
      current = [];
      currentLength = 0;
    }

    current.push(segment);
    currentLength += segment.text.length + 1;
  }

  if (current.length > 0) {
    chunks.push(toChunk(chunks.length, current));
  }

  return chunks;
}

function toChunk(index: number, segments: SubtitleSegment[]): TranscriptChunk {
  return {
    index,
    startMs: segments[0].startMs,
    endMs: segments[segments.length - 1].endMs,
    sourceText: segments.map((segment) => segment.text).join(" "),
    segments
  };
}

function parseVtt(content: string): SubtitleSegment[] {
  const lines = content.split(/\r?\n/);
  const segments: SubtitleSegment[] = [];

  let cueLines: string[] = [];
  let startMs = 0;
  let endMs = 0;

  const flush = () => {
    if (cueLines.length === 0) {
      return;
    }

    const text = normalizeCueText(cueLines.join(" "));
    if (text) {
      segments.push({ startMs, endMs, text });
    }
    cueLines = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    if (line.includes("-->")) {
      flush();
      const [rawStart, rawEnd] = line.split("-->").map((part) => part.trim().split(" ")[0]);
      startMs = toMilliseconds(rawStart);
      endMs = toMilliseconds(rawEnd);
      continue;
    }

    if (line.startsWith("WEBVTT") || line.startsWith("NOTE") || /^\d+$/.test(line.trim())) {
      continue;
    }

    cueLines.push(line.trim());
  }

  flush();
  return collapseDuplicateSegments(segments);
}

function parseSrt(content: string): SubtitleSegment[] {
  const blocks = content.split(/\r?\n\r?\n/);
  const segments: SubtitleSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      continue;
    }

    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }

    const [rawStart, rawEnd] = timingLine.split("-->").map((part) => part.trim().split(" ")[0]);
    const textLines = lines.slice(lines.indexOf(timingLine) + 1);
    const text = normalizeCueText(textLines.join(" "));
    if (text) {
      segments.push({
        startMs: toMilliseconds(rawStart.replace(",", ".")),
        endMs: toMilliseconds(rawEnd.replace(",", ".")),
        text
      });
    }
  }

  return collapseDuplicateSegments(segments);
}

function normalizeCueText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseDuplicateSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  const collapsed: SubtitleSegment[] = [];

  for (const segment of segments) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.text === segment.text) {
      last.endMs = segment.endMs;
      continue;
    }

    collapsed.push({ ...segment });
  }

  return collapsed;
}

function toMilliseconds(value: string): number {
  const match = value.match(/(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) {
    throw new AppError("INVALID_TIMESTAMP", `Unsupported subtitle timestamp: ${value}`);
  }

  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);

  return (((hours * 60) + minutes) * 60 + seconds) * 1000 + milliseconds;
}
