import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function findFirstMatchingFile(
  dirPath: string,
  predicate: (fileName: string) => boolean
): Promise<string | undefined> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && predicate(entry.name));
  return match ? path.join(dirPath, match.name) : undefined;
}

export async function cleanupDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}
