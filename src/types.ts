export type SubtitleSource = "manual" | "auto";

export interface CliOptions {
  url: string;
  outDir: string;
  model: string;
  subtitleSource: "english-only";
  keepTemp: boolean;
}

export interface VideoFormat {
  formatId: string;
  ext?: string;
  height?: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
}

export interface SubtitleTrack {
  ext?: string;
  url?: string;
  name?: string;
}

export interface VideoMetadata {
  id: string;
  title: string;
  webpageUrl: string;
  uploader?: string;
  duration?: number;
  formats: VideoFormat[];
  subtitles: Record<string, SubtitleTrack[]>;
  automaticCaptions: Record<string, SubtitleTrack[]>;
}

export interface SubtitleSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptChunk {
  index: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  segments: SubtitleSegment[];
}

export interface ExplanationItem {
  phrase: string;
  chinese: string;
  note: string;
}

export interface FormattedChunk {
  chunkIndex: number;
  sourceText: string;
  chineseTranslation: string;
  explanations: ExplanationItem[];
}

export interface FormattingResult {
  titleCandidates: string[];
  chunks: FormattedChunk[];
}

export interface RunMetadata {
  sourceUrl: string;
  videoId: string;
  videoTitle: string;
  subtitleSource: SubtitleSource;
  subtitleFile: string;
  videoFile: string;
  markdownFile: string;
  model: string;
  generatedAt: string;
}
