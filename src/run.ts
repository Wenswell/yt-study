import path from "node:path";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseCliArgs } from "./config.js";
import { cleanupDir, ensureDir } from "./lib/files.js";
import { AppError } from "./lib/errors.js";
import { formatTranscript, OpenAiLlmClient } from "./services/openai.js";
import { renderMarkdown } from "./services/renderer.js";
import { createTranscriptChunks, parseSubtitleFile } from "./services/subtitles.js";
import { ensureTooling } from "./services/tooling.js";
import { YoutubeService } from "./services/youtube.js";
import type { RunMetadata } from "./types.js";

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);

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

  const tempDir = await mkdtemp(path.join(tmpdir(), "yt-subtitle-formatter-"));

  try {
    const metadata = await youtube.getMetadata(options.url);
    youtube.ensure1080pAvailable(metadata);

    const outputDir = path.join(options.outDir, metadata.id);
    await ensureDir(outputDir);

    const assets = await youtube.downloadAssets(options.url, tempDir, metadata);
    const subtitleContent = await readFile(assets.subtitleFile, "utf8");
    const segments = parseSubtitleFile(subtitleContent);
    const chunks = createTranscriptChunks(segments);

    if (chunks.length === 0) {
      throw new AppError("EMPTY_TRANSCRIPT", "Subtitle parsing produced no transcript chunks.");
    }

    const llm = new OpenAiLlmClient(
      process.env.OPENAI_API_KEY,
      options.model,
      process.env.OPENAI_BASE_URL || undefined
    );
    const formatted = await formatTranscript(llm, chunks);

    const finalVideoPath = path.join(outputDir, path.basename(assets.videoFile));
    const finalSubtitlePath = path.join(outputDir, path.basename(assets.subtitleFile));
    const markdownPath = path.join(outputDir, "study-notes.md");
    const metadataPath = path.join(outputDir, "metadata.json");

    await copyFile(assets.videoFile, finalVideoPath);
    await copyFile(assets.subtitleFile, finalSubtitlePath);

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

    await writeFile(markdownPath, renderMarkdown(runMetadata, chunks, formatted), "utf8");
    await writeFile(metadataPath, JSON.stringify(runMetadata, null, 2), "utf8");

    console.log(`Saved video to ${finalVideoPath}`);
    console.log(`Saved subtitles to ${finalSubtitlePath}`);
    console.log(`Saved notes to ${markdownPath}`);
  } finally {
    if (!options.keepTemp) {
      await cleanupDir(tempDir);
    } else {
      console.log(`Temporary files kept at ${tempDir}`);
    }
  }
}
