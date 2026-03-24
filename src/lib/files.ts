import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

export async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing === content) {
      return false;
    }
  } catch {
    // Fall through and write the file when it does not exist or cannot be read.
  }

  await writeFile(filePath, content, "utf8");
  return true;
}
