import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseCliArgs } from "./config.js";
import { ensureDir } from "./lib/files.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { findReusableMetadata, saveMetadata } from "./services/metadata-cache.js";
import { createOpenAiJsonClient, formatTranscript } from "./services/openai.js";
import { parseSubtitleFile } from "./services/subtitles.js";
import { ensureTooling } from "./services/tooling.js";
import { YoutubeService } from "./services/youtube.js";
import type { RunOutputMetadata, StoredMetadata } from "./types.js";

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
    ffmpegPath: tooling.ffmpegPath
  });
  const metadata = await findReusableMetadata(options.outDir, options.url) ?? await youtube.getMetadata(options.url);

  const outputDir = path.join(options.outDir, metadata.id);
  await ensureDir(outputDir);
  logger.info("cli", `Using output directory ${outputDir}`);

  const storedMetadata: StoredMetadata = {
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
    generatedAt: new Date().toISOString()
  };

  if (!finalSubtitlePath) {
    await saveMetadata(outputDir, {
      ...storedMetadata,
      run: runMetadata
    });
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
    options.model,
    process.env.OPENAI_BASE_URL || undefined
  );
  const transcriptText = segments.map((segment) => segment.text).join(" ");
  const formatted = await formatTranscript(
    generateJson,
    metadata.fulltitle,
    metadata.description ?? "",
    transcriptText
  );

  await saveMetadata(outputDir, {
    ...storedMetadata,
    run: {
      ...runMetadata,
      model: options.model
    },
    formatted
  });
  logger.info("cli", "Saved metadata.json with embedded LLM output");
}
