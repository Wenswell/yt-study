import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseCliArgs } from "./config.js";
import { ensureDir, writeIfChanged } from "./lib/files.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { findReusableMetadata, saveMetadataCache } from "./services/metadata-cache.js";
import { createOpenAiJsonClient, formatTranscript } from "./services/openai.js";
import { renderMarkdown } from "./services/renderer.js";
import { createTranscriptChunks, parseSubtitleFile } from "./services/subtitles.js";
import { ensureTooling } from "./services/tooling.js";
import { YoutubeService } from "./services/youtube.js";
import type { RunMetadata } from "./types.js";

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);
  logger.info("cli", `Starting run for ${options.url}`);
  logger.info("cli", `Output directory root: ${options.outDir}`);
  logger.info("cli", `OpenAI model: ${options.model}`);

  if (!process.env.OPENAI_API_KEY) {
    throw new AppError("MISSING_OPENAI_KEY", "OPENAI_API_KEY is required.");
  }

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

  await saveMetadataCache(outputDir, options.url, metadata);

  const assets = await youtube.downloadAssets(options.url, outputDir, metadata);
  const finalVideoPath = assets.videoFile;
  const finalSubtitlePath = assets.subtitleFile;
  const markdownPath = path.join(outputDir, "study-notes.md");
  const metadataPath = path.join(outputDir, "metadata.json");

  logger.info("cli", `Saved video to ${finalVideoPath}`);
  logger.info("cli", `Saved subtitles to ${finalSubtitlePath}`);

  const subtitleContent = await readFile(finalSubtitlePath, "utf8");
  const segments = parseSubtitleFile(subtitleContent);
  const chunks = createTranscriptChunks(segments);
  logger.info("cli", `Parsed ${segments.length} subtitle segments into ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new AppError("EMPTY_TRANSCRIPT", "Subtitle parsing produced no transcript chunks.");
  }

  const generateJson = createOpenAiJsonClient(
    process.env.OPENAI_API_KEY,
    options.model,
    process.env.OPENAI_BASE_URL || undefined
  );
  const formatted = await formatTranscript(generateJson, chunks);

  const runMetadata: RunMetadata = {
    sourceUrl: options.url,
    videoId: metadata.id,
    videoTitle: metadata.title,
    subtitleSource: assets.subtitleSource,
    subtitleFile: finalSubtitlePath,
    videoFile: finalVideoPath,
    markdownFile: markdownPath,
    model: options.model,
    generatedAt: new Date().toISOString()
  };

  const markdownChanged = await writeIfChanged(markdownPath, renderMarkdown(runMetadata, chunks, formatted));
  const metadataChanged = await writeIfChanged(metadataPath, JSON.stringify(runMetadata, null, 2));

  logger.info("cli", markdownChanged ? `Saved notes to ${markdownPath}` : `Notes unchanged: ${markdownPath}`);
  logger.info("cli", metadataChanged ? `Saved metadata to ${metadataPath}` : `Metadata unchanged: ${metadataPath}`);
}
