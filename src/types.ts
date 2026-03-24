export type SubtitleSource = "manual" | "auto";

export interface CliOptions {
  url: string;
  outDir: string;
  model: string;
  subtitleSource: "english-only";
  keepTemp: boolean;
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  format?: string;
  url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  protocol?: string;
  format_note?: string;
  dynamic_range?: string;
  vcodec: string;
  acodec: string;
  fps?: number;
  audio_channels?: number;
  asr?: number;
  language?: string | null;
  language_preference?: number | null;
  container?: string;
  manifest_url?: string;
  fragments?: Array<Record<string, unknown>>;
  audio_ext?: string;
  video_ext?: string;
}

export interface SubtitleTrack {
  ext?: string;
  url?: string;
  name?: string;
  protocol?: string;
}

export interface VideoThumbnail {
  id?: string | number;
  width?: string | number;
  height?: string | number;
  url: string;
}

export interface RequestedSubtitle {
  ext?: string;
  filepath?: string;
  url?: string;
}

export interface HttpHeaders {
  "User-Agent"?: string;
  Accept?: string;
  "Accept-Language"?: string;
  Referer?: string;
  Cookie?: string;
  [key: string]: string | undefined;
}

export interface RawVideoMetadata {
  id: string;
  title: string;
  _type?: "video";
  display_id?: string;
  fulltitle?: string;
  webpage_url: string;
  original_url?: string;
  webpage_url_basename?: string;
  webpage_url_domain?: string | null;
  extractor?: string;
  extractor_key?: string;
  release_timestamp?: number;
  timestamp?: number;
  thumbnail?: string;
  thumbnails?: VideoThumbnail[];
  description?: string;
  upload_date?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel_id?: string;
  channel_url?: string;
  duration?: number;
  duration_string?: string;
  availability?: string;
  live_status?: string;
  was_live?: boolean;
  is_live?: boolean;
  age_limit?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  average_rating?: number;
  categories?: string[];
  tags?: string[];
  formats: VideoFormat[];
  subtitles?: Record<string, SubtitleTrack[]>;
  automatic_captions?: Record<string, SubtitleTrack[]>;
  requested_subtitles?: Record<string, RequestedSubtitle>;
  requested_formats?: VideoFormat[];
  http_headers?: HttpHeaders;
}

export interface VideoMetadata {
  id: string;
  title: string;
  webpage_url: string;
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
