interface DownloadJob {
  id: string;
  url: string;
  status: "queued" | "running" | "completed" | "failed";
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
  commentCount?: number;
  likeCount?: number;
  channelFollowerCount?: number;
  timestamp?: number;
  generatedAt?: string;
  model?: string;
  metadataUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

interface JobsResponse {
  jobs: DownloadJob[];
}

interface ItemsResponse {
  items: DownloadedItem[];
}

interface JobCreateResponse {
  error?: string;
}

const form = document.getElementById("job-form") as HTMLFormElement | null;
const input = document.getElementById("url") as HTMLInputElement | null;
const submitButton = document.getElementById("submit") as HTMLButtonElement | null;
const feedback = document.getElementById("feedback") as HTMLDivElement | null;
const jobsHost = document.getElementById("jobs") as HTMLDivElement | null;
const jobsEmpty = document.getElementById("jobs-empty") as HTMLDivElement | null;
const itemsEmpty = document.getElementById("items-empty") as HTMLDivElement | null;
const itemsTable = document.getElementById("items-table") as HTMLTableElement | null;
const itemsBody = document.getElementById("items-body") as HTMLTableSectionElement | null;

function setFeedback(message: string, type = ""): void {
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.className = `feedback${type ? ` ${type}` : ""}`;
}

function renderJobs(jobs: DownloadJob[]): void {
  if (!jobsHost || !jobsEmpty) {
    return;
  }

  jobsHost.innerHTML = "";
  jobsEmpty.hidden = jobs.length > 0;

  for (const job of jobs) {
    const node = document.createElement("article");
    node.className = "job";
    node.innerHTML = `
      <div>
        <strong>${job.url}</strong>
        <small>${new Date(job.updatedAt).toLocaleString()}</small>
        ${job.error ? `<small>${escapeHtml(job.error)}</small>` : ""}
      </div>
      <div class="status ${job.status}">${job.status}</div>
    `;
    jobsHost.appendChild(node);
  }
}

function renderItems(items: DownloadedItem[]): void {
  if (!itemsBody || !itemsTable || !itemsEmpty) {
    return;
  }

  itemsBody.innerHTML = "";
  itemsTable.hidden = items.length === 0;
  itemsEmpty.hidden = items.length > 0;

  for (const item of items) {
    const description = item.description ? escapeHtml(item.description) : "-";
    const coverContent = item.thumbnailUrl
      ? `<img class="cover" src="${item.thumbnailUrl}" alt="cover" />`
      : '<div class="cover-fallback">No Image</div>';
    const cover = item.videoUrl
      ? `<a href="${item.videoUrl}" target="_blank">${coverContent}</a>`
      : coverContent;
    const followers = item.channelFollowerCount != null
      ? `👥 ${formatCompactNumber(item.channelFollowerCount)}`
      : "-";
    const stats = [
      `👀 ${formatCompactNumber(item.viewCount)}`,
      `👍 ${formatCompactNumber(item.likeCount)}`,
      `💬 ${formatCompactNumber(item.commentCount)}`
    ].join("<br />");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Cover">${cover}</td>
      <td data-label="Video">
        <strong>${escapeHtml(item.fulltitle)}</strong><br />
        <div class="desc">${description}</div>
      </td>
      <td data-label="Channel">
        <strong>${escapeHtml(item.uploaderId || "-")}</strong><br />
        <span class="meta-line">${followers}</span>
      </td>
      <td data-label="Stats">${stats}</td>
      <td data-label="Length">${formatLength(item.duration)}</td>
      <td data-label="Time">${formatRelativeTime(item.timestamp)}</td>
      <td data-label="Files">
        ${item.metadataUrl ? `<a href="${item.metadataUrl}" target="_blank">Metadata</a>` : "-"}
      </td>
    `;
    itemsBody.appendChild(row);
  }
}

function formatCompactNumber(value?: number): string {
  return typeof value === "number"
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : "-";
}

function formatLength(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value < 60) {
    return `${Math.round(value)} sec`;
  }

  const minutes = value / 60;
  const rounded = minutes >= 10 ? Math.round(minutes) : Math.round(minutes * 10) / 10;
  return `${rounded} min`;
}

function formatRelativeTime(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - value);
  if (diffSeconds < 60) {
    return `${diffSeconds} sec ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} d ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} mo ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} yr ago`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function refresh(): Promise<void> {
  const [jobsResponse, itemsResponse] = await Promise.all([
    fetch("/api/jobs"),
    fetch("/api/items")
  ]);

  const jobsData = await jobsResponse.json() as JobsResponse;
  const itemsData = await itemsResponse.json() as ItemsResponse;
  renderJobs(jobsData.jobs || []);
  renderItems(itemsData.items || []);
}

async function submitJob(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!submitButton || !input) {
    return;
  }

  submitButton.disabled = true;
  setFeedback("Submitting job...");

  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: input.value })
  });

  const data = await response.json() as JobCreateResponse;
  submitButton.disabled = false;

  if (!response.ok) {
    setFeedback(data.error || "Request failed.", "error");
    return;
  }

  input.value = "";
  setFeedback("Job queued.", "success");
  await refresh();
}

form?.addEventListener("submit", (event) => {
  void submitJob(event);
});

void refresh();
window.setInterval(() => {
  void refresh();
}, 3000);
