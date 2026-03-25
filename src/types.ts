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
  fulltitle?: string;
  description?: string;
  webpage_url: string;
  _type?: string;
  thumbnail?: string;
  uploader_id?: string;
  duration?: number;
  view_count?: number;
  categories?: string[];
  comment_count?: number;
  like_count?: number;
  channel_follower_count?: number;
  timestamp?: number;
  formats: VideoFormat[];
  subtitles?: Record<string, SubtitleTrack[]>;
  automatic_captions?: Record<string, SubtitleTrack[]>;
}

export interface VideoMetadata {
  id: string;
  fulltitle: string;
  webpage_url: string;
  thumbnail?: string;
  description?: string;
  uploader_id?: string;
  duration?: number;
  view_count?: number;
  categories?: string[];
  media_type?: string;
  comment_count?: number;
  like_count?: number;
  channel_follower_count?: number;
  timestamp?: number;
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
  subtitleFile?: string;
  thumbnailFile: string;
  subtitleSource?: SubtitleSource;
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
  tags: string[];
  sections: StudySection[];
  focusVocabulary: VocabularyItem[];
  challengingVocabulary: VocabularyItem[];
  transcriptParagraph?: string;
  vocabulary?: VocabularyItem[];
}

export interface RunOutputMetadata {
  subtitleSource?: SubtitleSource;
  subtitleFile?: string;
  videoFile: string;
  thumbnailFile: string;
  formattedFile?: string;
  model?: string;
  generatedAt: string;
}

export interface StoredMetadata {
  sourceUrl: string;
  videoMetadata: VideoMetadata;
  run?: RunOutputMetadata;
  formatted?: FormattingResult;
  flagged?: boolean;
}
