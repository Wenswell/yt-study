import path from "node:path";
import { AppError } from "./lib/errors.js";
import type { CliOptions } from "./types.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

export function parseCliArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let url = "";
  let outDir = path.resolve(process.cwd(), "outputs");
  let model = DEFAULT_MODEL;
  let keepTemp = false;
  let subtitleSource: "english-only" = "english-only";

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
      case "--subtitle-source":
        subtitleSource = parseSubtitleSource(expectValue(token, args.shift()));
        break;
      case "--keep-temp":
        keepTemp = true;
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

  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    throw new AppError("INVALID_URL", "The provided URL must be a YouTube video link.");
  }

  return { url, outDir, model, subtitleSource, keepTemp };
}

function expectValue(flag: string, value?: string): string {
  if (!value) {
    throw new AppError("INVALID_ARGUMENT", `Expected a value after ${flag}.`);
  }

  return value;
}

function parseSubtitleSource(value: string): "english-only" {
  if (value !== "english-only") {
    throw new AppError(
      "INVALID_ARGUMENT",
      `Unsupported --subtitle-source value: ${value}. Expected "english-only".`
    );
  }

  return value;
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm start -- --url "<youtube-url>" [options]

Options:
  --out-dir <path>          Output directory (default: ./outputs)
  --model <name>            OpenAI model (default: ${DEFAULT_MODEL})
  --subtitle-source <mode>  Only "english-only" is supported
  --keep-temp               Keep temporary downloader artifacts
  --help                    Show this help message
`);
  process.exit(0);
}
