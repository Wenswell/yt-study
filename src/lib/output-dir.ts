import type { VideoMetadata } from "../types.js";

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function buildOutputDirectoryName(
  metadata: Pick<VideoMetadata, "uploader_id" | "fulltitle" | "id">
): string {
  const uploaderId = sanitizeDirectoryPart(metadata.uploader_id, "unknown-uploader", 60);
  const title = sanitizeDirectoryPart(metadata.fulltitle, "video", 100);
  const videoId = sanitizeDirectoryPart(metadata.id, "unknown-video", 40);

  return `${uploaderId}[${title}](${videoId})`;
}

function sanitizeDirectoryPart(value: string | undefined, fallback: string, maxLength: number): string {
  const sanitized = (value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();

  if (!sanitized) {
    return fallback;
  }

  if (WINDOWS_RESERVED_NAMES.test(sanitized)) {
    return `${fallback}-${sanitized}`;
  }

  return sanitized;
}
