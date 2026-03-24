import path from "node:path";
import { AppError } from "./lib/errors.js";
import { DEFAULT_OUTPUT_DIR } from "./paths.js";
import type { CliOptions } from "./types.js";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

export function parseCliArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let url = "";
  let outDir = DEFAULT_OUTPUT_DIR;
  let model = DEFAULT_MODEL;

  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }

    if (token === "--") {
      continue;
    }

    switch (token) {
      case "--url":
        url = expectValue(token, args.shift());
        break;
      case "--out-dir":
        outDir = path.resolve(expectValue(token, args.shift()));
        break;
      case "--model":
        model = expectValue(token, args.shift());
        break;
      case "--help":
        printHelpAndExit();
        break;
      default:
        throw new AppError("INVALID_ARGUMENT", `Unknown argument: ${token}`);
    }
  }

  if (!url) {
    throw new AppError("MISSING_URL", "Missing required --url argument.");
  }

  if (!isYoutubeUrl(url)) {
    throw new AppError("INVALID_URL", "The provided URL must be a YouTube video link.");
  }

  return { url, outDir, model };
}

export function isYoutubeUrl(value: string): boolean {
  return YOUTUBE_URL_PATTERN.test(value);
}

function expectValue(flag: string, value?: string): string {
  if (!value) {
    throw new AppError("INVALID_ARGUMENT", `Expected a value after ${flag}.`);
  }

  return value;
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm start -- --url "<youtube-url>" [options]

Options:
  --out-dir <path>          Output directory (default: ${DEFAULT_OUTPUT_DIR})
  --model <name>            OpenAI model (default: ${DEFAULT_MODEL})
  --help                    Show this help message
`);
  process.exit(0);
}
