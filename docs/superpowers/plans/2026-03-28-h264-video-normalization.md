# H.264 Video Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the download pipeline probes the final MP4 codec and returns an H.264 MP4 as `videoFile`, reusing an existing converted file when possible.

**Architecture:** Keep the change local to `YoutubeService` by adding a post-download normalization step after the source MP4 is located. Introduce a small command-execution seam so codec probing and conversion can be unit-tested without invoking real ffmpeg binaries.

**Tech Stack:** TypeScript, Node.js, Vitest, yt-dlp, ffmpeg, ffprobe

---

## File Structure

- Modify: `src/services/youtube.ts`
  Adds codec probe and H.264 normalization helpers, wires normalization into `downloadAssets()`, and exposes a narrow internal execution seam for tests.
- Modify: `tests/youtube.test.ts`
  Adds failing tests that prove existing H.264 files are kept, non-H.264 files are converted, and existing converted outputs are reused.
- Create: `docs/superpowers/plans/2026-03-28-h264-video-normalization.md`
  Records this execution plan.

### Task 1: Add failing tests for H.264 normalization behavior

**Files:**
- Modify: `C:\Users\ILove\Documents\repos\CodeX06\tests\youtube.test.ts`
- Test: `C:\Users\ILove\Documents\repos\CodeX06\tests\youtube.test.ts`

- [ ] **Step 1: Write the failing test for keeping an existing H.264 file**

```ts
it("keeps an existing h264 mp4 without converting", async () => {
  const commands: Array<{ command: string; args: string[] }> = [];
  const service = new YoutubeService({
    ytDlpPath: "yt-dlp",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    execCommand: async (command, args) => {
      commands.push({ command, args });
      if (command === "ffprobe") {
        return { stdout: "h264\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command}`);
    }
  });

  expect(result.videoFile).toBe(videoFile);
  expect(commands).toEqual([
    expect.objectContaining({ command: "ffprobe" })
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/youtube.test.ts`
Expected: FAIL because `YoutubeServiceOptions` does not yet accept `ffprobePath` or an injectable command runner, and no H.264 normalization logic exists.

- [ ] **Step 3: Write the failing tests for conversion and converted-file reuse**

```ts
it("converts a non-h264 mp4 and returns the converted path", async () => {
  // First ffprobe reports hevc for source file, then ffmpeg writes target file.
  // Expected final result.videoFile === `${plan.fileStem}.h264.mp4`.
});

it("reuses an existing converted h264 mp4", async () => {
  // First ffprobe reports hevc for source file, second ffprobe reports h264 for converted file.
  // Expected no ffmpeg invocation.
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test -- tests/youtube.test.ts`
Expected: FAIL with missing constructor options / missing normalization behavior assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/youtube.test.ts
git commit -m "test: define h264 normalization behavior"
```

### Task 2: Implement codec probing and H.264 normalization

**Files:**
- Modify: `C:\Users\ILove\Documents\repos\CodeX06\src\services\youtube.ts`
- Test: `C:\Users\ILove\Documents\repos\CodeX06\tests\youtube.test.ts`

- [ ] **Step 1: Add minimal constructor support for ffprobe and injectable command execution**

```ts
export interface YoutubeServiceOptions {
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath?: string;
  execCommand?: typeof execCommand;
}
```

- [ ] **Step 2: Add helpers for probing codec, computing converted path, and converting when required**

```ts
private async probeVideoCodec(filePath: string): Promise<string> {
  const { stdout } = await this.execCommand(this.ffprobePath, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);
  return stdout.trim().toLowerCase();
}

private async ensureH264Mp4(filePath: string): Promise<string> {
  const codec = await this.probeVideoCodec(filePath);
  if (codec === "h264") return filePath;
  const convertedPath = toH264OutputPath(filePath);
  // Reuse converted file when probe says it is already h264.
  return convertedPath;
}
```

- [ ] **Step 3: Wire normalization into `downloadAssets()` after the source MP4 is resolved**

```ts
const sourceVideoFile = existingVideoFile ?? await this.findVideoFile(outputDir, downloadPlan.fileStem);
if (!sourceVideoFile) {
  throw new AppError("VIDEO_DOWNLOAD_FAILED", "Video download completed without producing an MP4 file.");
}
const videoFile = await this.ensureH264Mp4(sourceVideoFile);
```

- [ ] **Step 4: Run the targeted tests and make them pass**

Run: `pnpm test -- tests/youtube.test.ts`
Expected: PASS, including the new H.264 normalization tests and the existing metadata/reuse tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/youtube.ts tests/youtube.test.ts
git commit -m "feat: normalize downloaded videos to h264"
```

### Task 3: Verify no regressions in the wider pipeline

**Files:**
- Test: `C:\Users\ILove\Documents\repos\CodeX06\tests\run.test.ts`
- Test: `C:\Users\ILove\Documents\repos\CodeX06\tests\web.test.ts`

- [ ] **Step 1: Run the most relevant integration coverage**

```bash
pnpm test -- tests/youtube.test.ts tests/run.test.ts tests/web.test.ts
```

- [ ] **Step 2: Confirm expected outcome**

Expected:
- `tests/youtube.test.ts` passes with the new probe/convert/reuse behavior.
- `tests/run.test.ts` still passes because downstream consumers only use the returned `videoFile`.
- `tests/web.test.ts` still passes because output URLs still derive from the stored `videoFile` path.

- [ ] **Step 3: Commit**

```bash
git add src/services/youtube.ts tests/youtube.test.ts docs/superpowers/plans/2026-03-28-h264-video-normalization.md
git commit -m "chore: record h264 normalization execution plan"
```
