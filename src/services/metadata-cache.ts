import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { writeIfChanged } from "../lib/files.js";
import { logger } from "../lib/logger.js";
import type { VideoMetadata } from "../types.js";

const CACHE_FILE_NAME = "video-metadata.json";

export interface MetadataCacheRecord {
  sourceUrl: string;
  metadata: VideoMetadata;
}

export function getMetadataCachePath(outputDir: string): string {
  return path.join(outputDir, CACHE_FILE_NAME);
}

export async function findReusableMetadata(
  outputRootDir: string,
  sourceUrl: string
): Promise<VideoMetadata | null> {
  try {
    const entries = await readdir(outputRootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const cacheFilePath = path.join(outputRootDir, entry.name, CACHE_FILE_NAME);

      try {
        const raw = await readFile(cacheFilePath, "utf8");
        const parsed = JSON.parse(raw) as MetadataCacheRecord;

        if (parsed.sourceUrl === sourceUrl && parsed.metadata?.id) {
          logger.info("metadata-cache", `Reusing cached metadata from ${cacheFilePath}`);
          return parsed.metadata;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  logger.info("metadata-cache", "No reusable metadata cache found");
  return null;
}

export async function saveMetadataCache(
  outputDir: string,
  sourceUrl: string,
  metadata: VideoMetadata
): Promise<string> {
  const cacheFilePath = getMetadataCachePath(outputDir);
  const payload: MetadataCacheRecord = {
    sourceUrl,
    metadata
  };

  const changed = await writeIfChanged(cacheFilePath, JSON.stringify(payload, null, 2));
  logger.info(
    "metadata-cache",
    changed ? `Saved metadata cache to ${cacheFilePath}` : `Metadata cache unchanged: ${cacheFilePath}`
  );
  return cacheFilePath;
}
