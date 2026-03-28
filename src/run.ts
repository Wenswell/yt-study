import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { parseCliArgs } from "./config.js";
import { ensureDir, writeIfChanged } from "./lib/files.js";
import { buildOutputDirectoryName } from "./lib/output-dir.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { findReusableMetadata, loadMetadata, saveMetadata } from "./services/metadata-cache.js";
import { createOpenAiJsonClient, formatTranscript } from "./services/openai.js";
import { renderFormattedMarkdown } from "./services/renderer.js";
import { parseSubtitleFile } from "./services/subtitles.js";
import { ensureTooling } from "./services/tooling.js";
import { YoutubeService } from "./services/youtube.js";
import type { RunOutputMetadata, StoredMetadata } from "./types.js";

const NON_SHORT_MODEL = "gemini-3.1-flash-lite-preview-thinking-medium";

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);
  await runWithOptions(options);
}

export async function runWithOptions(options: { url: string; outDir: string; model: string }): Promise<void> {
  logger.info("cli", `Starting run for ${options.url}`);
  logger.info("cli", `Output directory root: ${options.outDir}`);
  logger.info("cli", `OpenAI model: ${options.model}`);

  const tooling = await ensureTooling();
  if (tooling.bootstrapped.length > 0) {
    console.log(`Bootstrapped tools: ${tooling.bootstrapped.join(", ")}`);
  }

  const youtube = new YoutubeService({
    ytDlpPath: tooling.ytDlpPath,
    ffmpegPath: tooling.ffmpegPath,
    ffprobePath: tooling.ffprobePath
  });
  const metadata = await findReusableMetadata(options.outDir, options.url) ?? await youtube.getMetadata(options.url);
  const formattingMode = typeof metadata.duration === "number" && metadata.duration < 3 * 60
    ? "short"
    : "non-short";
  const effectiveModel = formattingMode === "short" ? options.model : NON_SHORT_MODEL;
  logger.info("cli", `Formatting mode: ${formattingMode}, effective model: ${effectiveModel}`);

  const outputDir = path.join(options.outDir, buildOutputDirectoryName(metadata));
  const studyNotesPath = path.join(outputDir, "formatted-info.md");
  await ensureDir(outputDir);
  logger.info("cli", `Using output directory ${outputDir}`);

  const existingMetadata = await loadMetadata(outputDir);
  const storedMetadata: StoredMetadata = {
    ...existingMetadata,
    sourceUrl: options.url,
    videoMetadata: metadata
  };
  await saveMetadata(outputDir, storedMetadata);

  const assets = await youtube.downloadAssets(options.url, outputDir, metadata);
  const finalVideoPath = assets.videoFile;
  const finalSubtitlePath = assets.subtitleFile;
  const finalThumbnailPath = assets.thumbnailFile;

  logger.info("cli", `${assets.reusedVideoFile ? "Reused" : "Saved"} video to ${finalVideoPath}`);
  logger.info("cli", `${assets.reusedThumbnailFile ? "Reused" : "Saved"} thumbnail to ${finalThumbnailPath}`);

  if (finalSubtitlePath) {
    logger.info("cli", `${assets.reusedSubtitleFile ? "Reused" : "Saved"} subtitles to ${finalSubtitlePath}`);
  } else {
    logger.warn("cli", "No English subtitles found. Skipping transcript formatting.");
  }

  const runMetadata: RunOutputMetadata = {
    subtitleSource: assets.subtitleSource,
    subtitleFile: finalSubtitlePath,
    videoFile: finalVideoPath,
    thumbnailFile: finalThumbnailPath,
    formattedFile: studyNotesPath,
    model: effectiveModel,
    generatedAt: new Date().toISOString()
  };
  const persistedRunMetadata: StoredMetadata = {
    ...storedMetadata,
    run: {
      ...storedMetadata.run,
      ...runMetadata
    }
  };
  await saveMetadata(outputDir, persistedRunMetadata);

  if (!await fileExists(studyNotesPath) && storedMetadata.formatted) {
    const changed = await writeIfChanged(
      studyNotesPath,
      renderFormattedMarkdown(storedMetadata.videoMetadata, storedMetadata.formatted)
    );
    logger.info("cli", changed ? `Rebuilt study notes from cached formatted data: ${studyNotesPath}` : `Study notes unchanged: ${studyNotesPath}`);
    return;
  }

  if (!finalSubtitlePath) {
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new AppError("MISSING_OPENAI_KEY", "OPENAI_API_KEY is required.");
  }

  const subtitleContent = await readFile(finalSubtitlePath, "utf8");
  const segments = parseSubtitleFile(subtitleContent);
  logger.info("cli", `Parsed ${segments.length} subtitle segments`);

  if (segments.length === 0) {
    throw new AppError("EMPTY_TRANSCRIPT", "Subtitle parsing produced no transcript content.");
  }

  const generateJson = createOpenAiJsonClient(
    process.env.OPENAI_API_KEY,
    effectiveModel,
    process.env.OPENAI_BASE_URL || undefined
  );
  const transcriptText = segments.map((segment) => segment.text).join(" ");
  const formatted = await formatTranscript(
    generateJson,
    metadata.fulltitle,
    metadata.description ?? "",
    transcriptText,
    { mode: formattingMode }
  );
  if (formattingMode !== "short") {
    formatted.transcriptParagraph = transcriptText;
  }
  const changed = await writeIfChanged(studyNotesPath, renderFormattedMarkdown(metadata, formatted));

  await saveMetadata(outputDir, {
    ...persistedRunMetadata,
    run: {
      ...persistedRunMetadata.run,
      ...runMetadata
    },
    formatted
  });
  logger.info("cli", changed ? `Saved study notes to ${studyNotesPath}` : `Study notes unchanged: ${studyNotesPath}`);
  logger.info("cli", "Saved metadata.json with embedded LLM output");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}
