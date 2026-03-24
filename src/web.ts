import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL, isYoutubeUrl } from "./config.js";
import { logger } from "./lib/logger.js";
import { runWithOptions } from "./run.js";
import type { StoredMetadata } from "./types.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "outputs");
const PORT = Number(process.env.PORT ?? "3000");

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
  title: string;
  sourceUrl: string;
  generatedAt?: string;
  subtitleSource?: string;
  model?: string;
  markdownUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
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
            if (!parsed.videoMetadata?.id || !parsed.videoMetadata?.title || !parsed.sourceUrl) {
              return null;
            }

            return {
              id: parsed.videoMetadata.id,
              title: parsed.videoMetadata.title,
              sourceUrl: parsed.sourceUrl,
              generatedAt: parsed.run?.generatedAt,
              subtitleSource: parsed.run?.subtitleSource,
              model: parsed.run?.model,
              markdownUrl: toOutputUrl(outputDir, parsed.run?.markdownFile),
              videoUrl: toOutputUrl(outputDir, parsed.run?.videoFile),
              thumbnailUrl: toOutputUrl(outputDir, parsed.run?.thumbnailFile)
            };
          } catch {
            return null;
          }
        })
    );

    return mappedItems
      .filter(isDownloadedItem)
      .sort((left, right) => (right.generatedAt ?? "").localeCompare(left.generatedAt ?? ""));
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

  if (req.method === "GET" && requestUrl.pathname.startsWith("/outputs/")) {
    return serveOutputFile(res, requestUrl.pathname);
  }

  return false;
}

async function serveOutputFile(res: ServerResponse, pathname: string): Promise<boolean> {
  const relativePath = decodeURIComponent(pathname.replace(/^\/outputs\//, ""));
  const filePath = path.resolve(OUTPUT_DIR, relativePath);

  if (!filePath.startsWith(OUTPUT_DIR)) {
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

function sendHtml(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>YouTube Download Desk</title>
  <style>
    :root {
      --bg: #f6f0e4;
      --panel: rgba(255, 252, 246, 0.92);
      --line: #d7c8af;
      --text: #2c2318;
      --muted: #786850;
      --accent: #9f4f2d;
      --accent-dark: #7f3d21;
      --success: #2f6f48;
      --error: #9d2d2d;
      --shadow: 0 18px 40px rgba(60, 43, 24, 0.12);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(202, 156, 107, 0.2), transparent 32%),
        radial-gradient(circle at right 20%, rgba(155, 79, 45, 0.14), transparent 28%),
        linear-gradient(180deg, #f8f3ea 0%, var(--bg) 100%);
      font-family: Georgia, "Times New Roman", serif;
    }

    .shell {
      max-width: 1080px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    .hero {
      margin-bottom: 24px;
      padding: 24px;
      border: 1px solid rgba(159, 79, 45, 0.16);
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(255,255,255,0.76), rgba(249, 240, 225, 0.92));
      box-shadow: var(--shadow);
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 0.95;
      letter-spacing: -0.03em;
      font-weight: 600;
    }

    .sub {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--panel);
      box-shadow: var(--shadow);
      padding: 18px;
      margin-bottom: 20px;
      backdrop-filter: blur(10px);
    }

    .panel h2 {
      margin: 0 0 14px;
      font-size: 18px;
      font-weight: 600;
    }

    form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
    }

    input {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.9);
      color: var(--text);
      font-size: 15px;
    }

    button {
      border: 0;
      border-radius: 14px;
      padding: 0 18px;
      background: var(--accent);
      color: #fff8f1;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 140ms ease, background 140ms ease;
    }

    button:hover { background: var(--accent-dark); transform: translateY(-1px); }
    button:disabled { opacity: 0.7; cursor: wait; transform: none; }

    .feedback {
      min-height: 24px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
    }

    .feedback.error { color: var(--error); }
    .feedback.success { color: var(--success); }

    .jobs {
      display: grid;
      gap: 10px;
    }

    .job {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.74);
      border: 1px solid rgba(215, 200, 175, 0.9);
    }

    .job small {
      display: block;
      color: var(--muted);
      margin-top: 4px;
    }

    .status {
      white-space: nowrap;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .status.completed { color: var(--success); }
    .status.failed { color: var(--error); }
    .status.running { color: var(--accent); }
    .status.queued { color: var(--muted); }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
    }

    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid rgba(215, 200, 175, 0.72);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }

    th {
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 12px;
    }

    td a {
      color: var(--accent-dark);
      text-decoration: none;
    }

    td a:hover { text-decoration: underline; }

    .empty {
      padding: 18px 4px 6px;
      color: var(--muted);
      font-size: 14px;
    }

    @media (max-width: 760px) {
      form { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr {
        padding: 10px 0;
        border-bottom: 1px solid rgba(215, 200, 175, 0.72);
      }
      td {
        border: 0;
        padding: 6px 0;
      }
      td::before {
        content: attr(data-label);
        display: block;
        margin-bottom: 4px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>YouTube Download Desk</h1>
      <p class="sub">Submit a YouTube URL to start a download and review completed items below.</p>
    </section>

    <section class="panel">
      <h2>Submit Job</h2>
      <form id="job-form">
        <input id="url" name="url" type="url" placeholder="https://www.youtube.com/watch?v=..." required />
        <button id="submit" type="submit">Start Download</button>
      </form>
      <div id="feedback" class="feedback"></div>
    </section>

    <section class="panel">
      <h2>Job Status</h2>
      <div id="jobs" class="jobs"></div>
      <div id="jobs-empty" class="empty">No jobs yet.</div>
    </section>

    <section class="panel">
      <h2>Downloaded Items</h2>
      <div id="items-empty" class="empty">No completed items yet.</div>
      <table id="items-table" hidden>
        <thead>
          <tr>
            <th>Title</th>
            <th>Source</th>
            <th>Generated</th>
            <th>Files</th>
          </tr>
        </thead>
        <tbody id="items-body"></tbody>
      </table>
    </section>
  </main>

  <script>
    const form = document.getElementById("job-form");
    const input = document.getElementById("url");
    const submitButton = document.getElementById("submit");
    const feedback = document.getElementById("feedback");
    const jobsHost = document.getElementById("jobs");
    const jobsEmpty = document.getElementById("jobs-empty");
    const itemsEmpty = document.getElementById("items-empty");
    const itemsTable = document.getElementById("items-table");
    const itemsBody = document.getElementById("items-body");

    function setFeedback(message, type = "") {
      feedback.textContent = message || "";
      feedback.className = "feedback" + (type ? " " + type : "");
    }

    function renderJobs(jobs) {
      jobsHost.innerHTML = "";
      jobsEmpty.hidden = jobs.length > 0;

      for (const job of jobs) {
        const node = document.createElement("article");
        node.className = "job";
        node.innerHTML = \`
          <div>
            <strong>\${job.url}</strong>
            <small>\${new Date(job.updatedAt).toLocaleString()}</small>
            \${job.error ? \`<small>\${job.error}</small>\` : ""}
          </div>
          <div class="status \${job.status}">\${job.status}</div>
        \`;
        jobsHost.appendChild(node);
      }
    }

    function renderItems(items) {
      itemsBody.innerHTML = "";
      itemsTable.hidden = items.length === 0;
      itemsEmpty.hidden = items.length > 0;

      for (const item of items) {
        const row = document.createElement("tr");
        row.innerHTML = \`
          <td data-label="Title">
            <strong>\${item.title}</strong><br />
            <small>\${item.model || ""}</small>
          </td>
          <td data-label="Source"><a href="\${item.sourceUrl}" target="_blank" rel="noreferrer">\${item.sourceUrl}</a></td>
          <td data-label="Generated">\${item.generatedAt ? new Date(item.generatedAt).toLocaleString() : "-"}</td>
          <td data-label="Files">
            \${item.markdownUrl ? \`<a href="\${item.markdownUrl}" target="_blank">Notes</a>\` : ""}
            \${item.videoUrl ? \`<br /><a href="\${item.videoUrl}" target="_blank">Video</a>\` : ""}
            \${item.thumbnailUrl ? \`<br /><a href="\${item.thumbnailUrl}" target="_blank">Thumbnail</a>\` : ""}
          </td>
        \`;
        itemsBody.appendChild(row);
      }
    }

    async function refresh() {
      const [jobsResponse, itemsResponse] = await Promise.all([
        fetch("/api/jobs"),
        fetch("/api/items")
      ]);

      const jobsData = await jobsResponse.json();
      const itemsData = await itemsResponse.json();
      renderJobs(jobsData.jobs || []);
      renderItems(itemsData.items || []);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submitButton.disabled = true;
      setFeedback("Submitting job...");

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input.value })
      });

      const data = await response.json();
      submitButton.disabled = false;

      if (!response.ok) {
        setFeedback(data.error || "Request failed.", "error");
        return;
      }

      input.value = "";
      setFeedback("Job queued.", "success");
      await refresh();
    });

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`);
}

function toOutputUrl(outputDir: string, filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const relativePath = path.relative(outputDir, filePath);
  if (relativePath.startsWith("..")) {
    return undefined;
  }

  return `/outputs/${relativePath.split(path.sep).join("/")}`;
}

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
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
        sendHtml(res);
        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      logger.error("web", error instanceof Error ? error.message : String(error));
      sendJson(res, 500, { error: "Internal server error." });
    }
  });

  server.listen(port, () => {
    logger.info("web", `Web UI listening on http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startWebServer();
}
