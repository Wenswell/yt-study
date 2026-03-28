import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { logger } from "../lib/logger.js";
import { execCommand } from "../lib/process.js";

export interface ToolCheckResult {
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
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
  logger.info("tooling", "Checking yt-dlp, ffmpeg, and ffprobe availability");
  const bootstrapped: string[] = [];
  let ytDlpPath = await locateBinary(process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]);
  let ffmpegPath = await locateBinary(process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]);
  let ffprobePath = await locateFfprobeBinary(ffmpegPath);

  if (!ytDlpPath) {
    logger.warn("tooling", "yt-dlp not found in PATH, attempting bootstrap");
    const installed = await tryBootstrapWithWinget("yt-dlp.yt-dlp");
    if (installed) {
      bootstrapped.push("yt-dlp");
      ytDlpPath = await locateBinary(process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]);
      logger.info("tooling", "yt-dlp bootstrap completed");
    }
  }

  if (!ffmpegPath) {
    logger.warn("tooling", "ffmpeg not found in PATH, attempting bootstrap");
    const installed = await tryBootstrapWithWinget("Gyan.FFmpeg");
    if (installed) {
      bootstrapped.push("ffmpeg");
      ffmpegPath = await locateBinary(process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]);
      ffprobePath = await locateFfprobeBinary(ffmpegPath);
      logger.info("tooling", "ffmpeg bootstrap completed");
    }
  }

  if (!ffprobePath && ffmpegPath) {
    ffprobePath = await locateFfprobeBinary(ffmpegPath);
  }

  if (!ytDlpPath || !ffmpegPath || !ffprobePath) {
    logger.error("tooling", "Required external tools are still missing after bootstrap attempt");
    throw new Error(buildInstallInstructions(Boolean(ytDlpPath), Boolean(ffmpegPath), Boolean(ffprobePath)));
  }

  logger.info("tooling", `Using yt-dlp at ${ytDlpPath}`);
  logger.info("tooling", `Using ffmpeg at ${ffmpegPath}`);
  logger.info("tooling", `Using ffprobe at ${ffprobePath}`);
  return { ytDlpPath, ffmpegPath, ffprobePath, bootstrapped };
}

async function locateFfprobeBinary(ffmpegPath?: string): Promise<string | undefined> {
  const probeNames = process.platform === "win32" ? ["ffprobe.exe", "ffprobe"] : ["ffprobe"];

  if (ffmpegPath) {
    for (const name of probeNames) {
      const siblingPath = path.join(path.dirname(ffmpegPath), name);
      if (await isExecutable(siblingPath)) {
        return siblingPath;
      }
    }
  }

  return locateBinary(probeNames);
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
    logger.info("tooling", `Running winget bootstrap for ${packageId}`);
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
    logger.warn("tooling", `winget bootstrap failed for ${packageId}`);
    return false;
  }
}

function buildInstallInstructions(hasYtDlp: boolean, hasFfmpeg: boolean, hasFfprobe: boolean): string {
  const missing = [
    hasYtDlp ? null : "yt-dlp",
    hasFfmpeg ? null : "ffmpeg",
    hasFfprobe ? null : "ffprobe"
  ].filter(Boolean);

  const platform = os.platform();

  if (platform === "win32") {
    return [
      `Missing required tools: ${missing.join(", ")}.`,
      "Automatic bootstrap was attempted but did not complete.",
      "Install manually with one of the following commands:",
      !hasYtDlp ? "  winget install --id yt-dlp.yt-dlp --exact" : null,
      !hasFfmpeg || !hasFfprobe ? "  winget install --id Gyan.FFmpeg --exact" : null
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (platform === "darwin") {
    return [
      `Missing required tools: ${missing.join(", ")}.`,
      "Install manually with Homebrew:",
      !hasYtDlp ? "  brew install yt-dlp" : null,
      !hasFfmpeg || !hasFfprobe ? "  brew install ffmpeg" : null
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Missing required tools: ${missing.join(", ")}.`,
    "Install them manually with your package manager.",
    !hasYtDlp ? "  sudo apt install yt-dlp" : null,
    !hasFfmpeg || !hasFfprobe ? "  sudo apt install ffmpeg" : null
  ]
    .filter(Boolean)
    .join("\n");
}
