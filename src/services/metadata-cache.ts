import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { writeIfChanged } from "../lib/files.js";
import { logger } from "../lib/logger.js";
import type { StoredMetadata, VideoMetadata } from "../types.js";

const METADATA_FILE_NAME = "metadata.json";

export function getMetadataPath(outputDir: string): string {
  return path.join(outputDir, METADATA_FILE_NAME);
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

      const metadataPath = path.join(outputRootDir, entry.name, METADATA_FILE_NAME);

      try {
        const raw = await readFile(metadataPath, "utf8");
        const parsed = JSON.parse(raw) as StoredMetadata;

        if (parsed.sourceUrl === sourceUrl && parsed.videoMetadata?.id) {
          logger.info("metadata", `Reusing cached video metadata from ${metadataPath}`);
          return parsed.videoMetadata;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  logger.info("metadata", "No reusable metadata file found");
  return null;
}

export async function saveMetadata(outputDir: string, metadata: StoredMetadata): Promise<string> {
  const metadataPath = getMetadataPath(outputDir);
  const changed = await writeIfChanged(metadataPath, JSON.stringify(metadata, null, 2));

  logger.info(
    "metadata",
    changed ? `Saved metadata to ${metadataPath}` : `Metadata unchanged: ${metadataPath}`
  );

  return metadataPath;
}
