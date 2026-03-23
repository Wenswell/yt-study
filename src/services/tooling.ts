import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execCommand } from "../lib/process.js";

export interface ToolCheckResult {
  ytDlpPath: string;
  ffmpegPath: string;
  bootstrapped: string[];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function locateBinary(names: string[]): Promise<string | undefined> {
  const pathEnv = process.env.PATH ?? "";
  const paths = pathEnv.split(path.delimiter).filter(Boolean);

  for (const dirPath of paths) {
    for (const name of names) {
      const fullPath = path.join(dirPath, name);
      if (await isExecutable(fullPath)) {
        return fullPath;
      }
    }
  }

  return undefined;
}

export async function ensureTooling(): Promise<ToolCheckResult> {
  const bootstrapped: string[] = [];
  let ytDlpPath = await locateBinary(process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]);
  let ffmpegPath = await locateBinary(process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]);

  if (!ytDlpPath) {
    const installed = await tryBootstrapWithWinget("yt-dlp.yt-dlp");
    if (installed) {
      bootstrapped.push("yt-dlp");
      ytDlpPath = await locateBinary(process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]);
    }
  }

  if (!ffmpegPath) {
    const installed = await tryBootstrapWithWinget("Gyan.FFmpeg");
    if (installed) {
      bootstrapped.push("ffmpeg");
      ffmpegPath = await locateBinary(process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]);
    }
  }

  if (!ytDlpPath || !ffmpegPath) {
    throw new Error(buildInstallInstructions(Boolean(ytDlpPath), Boolean(ffmpegPath)));
  }

  return { ytDlpPath, ffmpegPath, bootstrapped };
}

async function tryBootstrapWithWinget(packageId: string): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  const wingetPath = await locateBinary(["winget.exe", "winget"]);
  if (!wingetPath) {
    return false;
  }

  try {
    await execCommand(wingetPath, [
      "install",
      "--id",
      packageId,
      "--exact",
      "--accept-package-agreements",
      "--accept-source-agreements"
    ]);
    return true;
  } catch {
    return false;
  }
}

function buildInstallInstructions(hasYtDlp: boolean, hasFfmpeg: boolean): string {
  const missing = [
    hasYtDlp ? null : "yt-dlp",
    hasFfmpeg ? null : "ffmpeg"
  ].filter(Boolean);

  const platform = os.platform();

  if (platform === "win32") {
    return [
      `Missing required tools: ${missing.join(", ")}.`,
      "Automatic bootstrap was attempted but did not complete.",
      "Install manually with one of the following commands:",
      !hasYtDlp ? "  winget install --id yt-dlp.yt-dlp --exact" : null,
      !hasFfmpeg ? "  winget install --id Gyan.FFmpeg --exact" : null
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (platform === "darwin") {
    return [
      `Missing required tools: ${missing.join(", ")}.`,
      "Install manually with Homebrew:",
      !hasYtDlp ? "  brew install yt-dlp" : null,
      !hasFfmpeg ? "  brew install ffmpeg" : null
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Missing required tools: ${missing.join(", ")}.`,
    "Install them manually with your package manager.",
    !hasYtDlp ? "  sudo apt install yt-dlp" : null,
    !hasFfmpeg ? "  sudo apt install ffmpeg" : null
  ]
    .filter(Boolean)
    .join("\n");
}
