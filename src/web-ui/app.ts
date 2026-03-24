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
  formattedUrl?: string;
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
const formattedDialog = document.getElementById("formatted-dialog") as HTMLDialogElement | null;
const formattedClose = document.getElementById("formatted-close") as HTMLButtonElement | null;
const formattedTitle = document.getElementById("formatted-title") as HTMLHeadingElement | null;
const formattedContent = document.getElementById("formatted-content") as HTMLPreElement | null;

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
    const coverContent = item.thumbnailUrl
      ? `<img class="cover" src="${item.thumbnailUrl}" alt="cover" />`
      : '<div class="cover-fallback">No Image</div>';
    const cover = item.thumbnailUrl
      ? `<a href="${item.thumbnailUrl}" target="_blank">${coverContent}</a>`
      : coverContent;
    const previewButton = item.formattedUrl
      ? `<button class="ghost-button preview-button" type="button" data-formatted-url="${escapeAttribute(item.formattedUrl)}" data-title="${escapeAttribute(item.fulltitle)}">📝 Notes</button>`
      : "";
    const fileButton = item.videoUrl
      ? `<button class="ghost-button video-button" type="button" data-video-url="${escapeAttribute(item.videoUrl)}">🎬 Open</button>`
      : "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Cover">${cover}</td>
      <td data-label="Title" class="title-cell">
        <strong>${escapeHtml(item.fulltitle)}</strong>
        <div class="title-meta">
          ${renderStatChip("🕒", formatRelativeTime(item.timestamp))}
          ${renderStatChip("⏱️", formatLength(item.duration))}
        </div>
      </td>
      <td data-label="Meta">
        <div class="meta-stack">
          <div class="meta-row meta-row-wide">
            ${renderStatChip("👤", escapeHtml(item.uploaderId || "-"))}
            ${renderStatChip("👥", formatCompactNumber(item.channelFollowerCount))}
          </div>
          <div class="meta-row meta-row-even">
            ${renderStatChip("❤️", formatCompactNumber(item.likeCount))}
            ${renderStatChip("💬", formatCompactNumber(item.commentCount))}
            ${renderStatChip("👁️", formatCompactNumber(item.viewCount))}
          </div>
        </div>
      </td>
      <td data-label="Actions">
        <div class="action-links">
          ${previewButton}
          ${fileButton}
        </div>
      </td>
    `;
    itemsBody.appendChild(row);
  }
}

function renderStatChip(label: string, value: string): string {
  return `
    <div class="stat-chip">
      <strong>${label}</strong>
      <span>${value}</span>
    </div>
  `;
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

function escapeAttribute(value: string): string {
  return escapeHtml(value);
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

async function openFormattedModal(formattedUrl: string, title: string): Promise<void> {
  if (!formattedDialog || !formattedContent || !formattedTitle) {
    return;
  }

  formattedTitle.textContent = title;
  formattedContent.textContent = "Loading formatted content...";
  if (!formattedDialog.open) {
    formattedDialog.showModal();
  }

  try {
    const response = await fetch(formattedUrl);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    formattedContent.textContent = await response.text();
  } catch (error) {
    formattedContent.textContent = `Unable to load formatted content: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function closeFormattedModal(): void {
  if (!formattedDialog || !formattedContent) {
    return;
  }

  formattedDialog.close();
  formattedContent.textContent = "";
}

form?.addEventListener("submit", (event) => {
  void submitJob(event);
});

itemsBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const previewButton = target.closest(".preview-button");
  if (previewButton instanceof HTMLButtonElement) {
    const formattedUrl = previewButton.dataset.formattedUrl;
    const title = previewButton.dataset.title || "Study Notes";
    if (!formattedUrl) {
      return;
    }

    void openFormattedModal(formattedUrl, title);
    return;
  }

  const videoButton = target.closest(".video-button");
  if (!(videoButton instanceof HTMLButtonElement)) {
    return;
  }

  const videoUrl = videoButton.dataset.videoUrl;
  if (!videoUrl) {
    return;
  }

  window.open(videoUrl, "_blank", "noopener,noreferrer");
});

formattedClose?.addEventListener("click", closeFormattedModal);
formattedDialog?.addEventListener("click", (event) => {
  if (event.target === formattedDialog) {
    closeFormattedModal();
  }
});
formattedDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeFormattedModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && formattedDialog?.open) {
    closeFormattedModal();
  }
});

void refresh();
window.setInterval(() => {
  void refresh();
}, 3000);
