import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL, isYoutubeUrl } from "./config.js";
import { logger } from "./lib/logger.js";
import { DEFAULT_OUTPUT_DIR } from "./paths.js";
import { runWithOptions } from "./run.js";
import { loadMetadata, saveMetadata } from "./services/metadata-cache.js";
import type { StoredMetadata } from "./types.js";

const OUTPUT_DIR = DEFAULT_OUTPUT_DIR;
const PORT = Number(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "0.0.0.0";
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "web-ui");
const WEB_DIST_DIR = path.resolve(process.cwd(), "dist", "src", "web-ui");

type JobStatus = "queued" | "running" | "completed" | "failed";

interface DownloadJob {
  id: string;
  url: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

interface DownloadedItem {
  id: string;
  fulltitle: string;
  sourceUrl: string;
  description?: string;
  uploaderId?: string;
  duration?: number;
  viewCount?: number;
  categories?: string[];
  commentCount?: number;
  likeCount?: number;
  channelFollowerCount?: number;
  timestamp?: number;
  generatedAt?: string;
  subtitleSource?: string;
  model?: string;
  formattedUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  flagged?: boolean;
}

const jobs: DownloadJob[] = [];
let processing = false;

export async function listDownloadedItems(outputDir = OUTPUT_DIR): Promise<DownloadedItem[]> {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    const mappedItems: Array<DownloadedItem | null> = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const metadataPath = path.join(outputDir, entry.name, "metadata.json");

          try {
            const raw = await readFile(metadataPath, "utf8");
            const parsed = JSON.parse(raw) as StoredMetadata;
            if (!parsed.videoMetadata?.id || !parsed.videoMetadata?.fulltitle || !parsed.sourceUrl) {
              return null;
            }

            return {
              id: parsed.videoMetadata.id,
              fulltitle: parsed.videoMetadata.fulltitle,
              sourceUrl: parsed.sourceUrl,
              description: parsed.videoMetadata.description,
              uploaderId: parsed.videoMetadata.uploader_id,
              duration: parsed.videoMetadata.duration,
              viewCount: parsed.videoMetadata.view_count,
              categories: parsed.videoMetadata.categories,
              commentCount: parsed.videoMetadata.comment_count,
              likeCount: parsed.videoMetadata.like_count,
              channelFollowerCount: parsed.videoMetadata.channel_follower_count,
              timestamp: parsed.videoMetadata.timestamp,
              generatedAt: parsed.run?.generatedAt,
              subtitleSource: parsed.run?.subtitleSource,
              model: parsed.run?.model,
              formattedUrl: toOutputUrl(outputDir, parsed.run?.formattedFile),
              videoUrl: toOutputUrl(outputDir, parsed.run?.videoFile),
              thumbnailUrl: toOutputUrl(outputDir, parsed.run?.thumbnailFile),
              flagged: parsed.flagged === true
            };
          } catch {
            return null;
          }
        })
    );

    return mappedItems
      .filter(isDownloadedItem)
      .sort((left, right) =>
        Number(left.flagged === true) - Number(right.flagged === true)
        || (right.generatedAt ?? "").localeCompare(left.generatedAt ?? "")
      );
  } catch {
    return [];
  }
}

function isDownloadedItem(value: DownloadedItem | null): value is DownloadedItem {
  return value !== null;
}

function enqueueJob(url: string): DownloadJob {
  const now = new Date().toISOString();
  const job: DownloadJob = {
    id: crypto.randomUUID(),
    url,
    status: "queued",
    createdAt: now,
    updatedAt: now
  };

  jobs.unshift(job);
  void processQueue();
  return job;
}

async function processQueue(): Promise<void> {
  if (processing) {
    return;
  }

  processing = true;

  try {
    while (true) {
      const nextJob = jobs.find((job) => job.status === "queued");
      if (!nextJob) {
        return;
      }

      nextJob.status = "running";
      nextJob.updatedAt = new Date().toISOString();

      try {
        await runWithOptions({
          url: nextJob.url,
          outDir: OUTPUT_DIR,
          model: DEFAULT_MODEL
        });
        nextJob.status = "completed";
      } catch (error) {
        nextJob.status = "failed";
        nextJob.error = error instanceof Error ? error.message : String(error);
      }

      nextJob.updatedAt = new Date().toISOString();
    }
  } finally {
    processing = false;
  }
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && requestUrl.pathname === "/api/items") {
    return sendJson(res, 200, { items: await listDownloadedItems() });
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/jobs") {
    return sendJson(res, 200, { jobs });
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/jobs") {
    const body = await readJsonBody(req);
    const jobUrl = typeof body.url === "string" ? body.url.trim() : "";

    if (!isYoutubeUrl(jobUrl)) {
      return sendJson(res, 400, { error: "Please enter a valid YouTube URL." });
    }

    const job = enqueueJob(jobUrl);
    return sendJson(res, 202, { job });
  }

  const flagMatch = req.method === "POST"
    ? requestUrl.pathname.match(/^\/api\/items\/([^/]+)\/flag$/)
    : null;
  if (flagMatch) {
    const itemId = decodeURIComponent(flagMatch[1]);
    const body = await readJsonBody(req);
    const flagged = body.flagged === true;
    const item = await updateItemFlag(itemId, flagged);

    if (!item) {
      return sendJson(res, 404, { error: "Item not found." });
    }

    return sendJson(res, 200, { ok: true, item });
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/outputs/")) {
    return serveRootFile(res, OUTPUT_DIR, requestUrl.pathname.replace(/^\/outputs/, ""));
  }

  return false;
}

async function serveRootFile(res: ServerResponse, rootDir: string, relativeUrl: string): Promise<boolean> {
  const relativePath = decodeURIComponent(relativeUrl.replace(/^\/+/, ""));
  const filePath = path.resolve(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return true;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendText(res, 404, "Not Found");
      return true;
    }

    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    sendText(res, 404, "Not Found");
    return true;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): true {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
  return true;
}

function sendText(res: ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function updateItemFlag(itemId: string, flagged: boolean): Promise<DownloadedItem | null> {
  logger.info('web', `updateItemFlag: ${itemId} to ${flagged}`)
  const itemDir = path.resolve(OUTPUT_DIR, itemId);
  if (!itemDir.startsWith(OUTPUT_DIR)) {
    return null;
  }

  const metadata = await loadMetadata(itemDir);
  if (!metadata?.videoMetadata?.id || !metadata.sourceUrl) {
    return null;
  }

  await saveMetadata(itemDir, {
    ...metadata,
    flagged
  });

  const items = await listDownloadedItems(OUTPUT_DIR);
  return items.find((item) => item.id === itemId) ?? null;
}

function toOutputUrl(outputDir: string, filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const relativePath = path.relative(outputDir, filePath);
  if (relativePath.startsWith("..")) {
    return undefined;
  }

  const encodedPath = relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/outputs/${encodedPath}`;
}

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".srt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export function startWebServer(port = PORT) {
  const server = createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) {
        return;
      }

      if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
        await serveRootFile(res, WEB_DIR, "/index.html");
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/static/")) {
        const assetPath = req.url.replace(/^\/static/, "");
        const assetRootDir = path.extname(assetPath).toLowerCase() === ".js" ? WEB_DIST_DIR : WEB_DIR;
        await serveRootFile(res, assetRootDir, assetPath);
        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      logger.error("web", error instanceof Error ? error.message : String(error));
      sendJson(res, 500, { error: "Internal server error." });
    }
  });

  server.listen(port, HOST, () => {
    logger.info("web", `Web UI listening on http://${HOST}:${port}`);
  });

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startWebServer();
}
