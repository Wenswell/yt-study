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

export interface StudySection {
  english: string;
  chinese: string;
}

export interface VocabularyItem {
  phrase: string;
  partOfSpeech?: string;
  meaning: string;
}

export interface FormattingResult {
  titleCandidates: string[];
  sections: StudySection[];
  vocabulary: VocabularyItem[];
}

export interface RunOutputMetadata {
  subtitleSource: SubtitleSource;
  subtitleFile: string;
  videoFile: string;
  thumbnailFile: string;
  markdownFile: string;
  model: string;
  generatedAt: string;
}

export interface StoredMetadata {
  sourceUrl: string;
  videoMetadata: VideoMetadata;
  run?: RunOutputMetadata;
}
