export type SubtitleSource = "manual" | "auto";

export interface CliOptions {
  url: string;
  outDir: string;
  model: string;
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  height?: number;
  vbr?: number;
  tbr?: number;
  filesize?: number;
  filesize_approx?: number;
  fps?: number;
  vcodec: string;
  acodec: string;
}

export interface SubtitleTrack {
  ext?: string;
}

export interface RawVideoMetadata {
  id: string;
  title: string;
  webpage_url: string;
  thumbnail?: string;
  uploader?: string;
  duration?: number;
  formats: VideoFormat[];
  subtitles?: Record<string, SubtitleTrack[]>;
  automatic_captions?: Record<string, SubtitleTrack[]>;
}

export interface VideoMetadata {
  id: string;
  title: string;
  webpage_url: string;
  thumbnail?: string;
  uploader?: string;
  duration?: number;
  formats: VideoFormat[];
  subtitles?: Record<string, SubtitleTrack[]>;
  automatic_captions?: Record<string, SubtitleTrack[]>;
}

export interface DownloadPlan {
  fileStem: string;
  resolutionLabel: string;
  videoFormatSelector: string;
}

export interface DownloadPaths {
  videoFile: string;
  subtitleFile: string;
  thumbnailFile: string;
  subtitleSource: SubtitleSource;
  reusedVideoFile: boolean;
  reusedSubtitleFile: boolean;
  reusedThumbnailFile: boolean;
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
  thumbnailFile: string;
  markdownFile: string;
  model: string;
  generatedAt: string;
}
