# H.264 Video Normalization Design

## Goal

Integrate codec verification into the existing YouTube asset download flow so that the downstream pipeline always uses an H.264 MP4 as `videoFile`.

The behavior change is:

- After locating or downloading the MP4, inspect the actual file codec.
- If the file already uses H.264, keep using it.
- If the file does not use H.264, create a converted H.264 MP4 once and use that converted file as `videoFile` for the rest of the run.
- If a previously converted H.264 MP4 already exists and is valid, reuse it instead of converting again.

## Current Context

The current flow in `src/services/youtube.ts` does three things:

- Reuses existing video, subtitle, and thumbnail files when present.
- Downloads any missing subtitle and thumbnail assets.
- Downloads a merged MP4 through `yt-dlp` when the video file is missing.

Today the service assumes that any reused or newly downloaded MP4 is acceptable. There is no probe step on the final file, so downstream consumers may receive a non-H.264 MP4.

## Proposed Approach

Add a post-download normalization step in `YoutubeService.downloadAssets()`:

1. Resolve the source MP4 exactly as today.
2. Pass that file to a new `ensureH264Mp4()` helper.
3. `ensureH264Mp4()` probes the actual video stream codec with `ffprobe`.
4. If the codec is `h264`, return the original file path unchanged.
5. If the codec is not `h264`, derive a deterministic converted output path in the same directory using the original base name plus `.h264.mp4`.
6. If that converted file already exists, probe it first; if it is already `h264`, return it immediately.
7. Otherwise run `ffmpeg` to convert the source file to H.264 MP4 and return the converted path.

This keeps the change local to the existing asset pipeline and avoids altering unrelated rendering, metadata, or web-serving logic.

## File Naming

Converted files will use this pattern:

- Source: `Demo Video 1080p.mp4`
- Converted: `Demo Video 1080p.h264.mp4`

This naming is deterministic, easy to inspect manually, and safe to reuse across repeated runs.

The original file is left in place. The pipeline switches to the converted path by returning it as `DownloadPaths.videoFile`.

## Codec Probe Rules

Probe behavior:

- Use `ffprobe` to read the codec name of the first video stream.
- Treat a missing codec result as an error because the pipeline cannot prove the output is usable.
- Compare case-insensitively against `h264`.

Why this is necessary:

- `yt-dlp` metadata describes candidate formats, not the guaranteed codec of a reused local file.
- Muxed outputs and reused files must be validated from the actual artifact on disk.

## Conversion Rules

Conversion behavior:

- Use `ffmpeg`.
- Encode video with `libx264`.
- Copy the audio stream if possible to avoid unnecessary audio re-encoding.
- Output an MP4 file at the deterministic converted path.
- Overwrite the converted target when regeneration is required.

The service will not convert when:

- The source file is already H.264.
- A valid converted `*.h264.mp4` already exists.

This satisfies the "do not repeat conversion" requirement.

## Data Flow Impact

`DownloadPaths.videoFile` remains the only downstream contract change point.

Downstream services already consume `videoFile` as an opaque path, so the rest of the pipeline can remain unchanged as long as `downloadAssets()` returns the correct final path.

Reuse flags:

- `reusedVideoFile` will continue to mean the original download step was skipped because a source MP4 already existed.
- The first version of this change will not add a separate "reused converted file" flag because no current caller needs that distinction.

## Error Handling

New failure cases:

- Probe failure on the source MP4.
- Conversion failure when creating the H.264 MP4.
- Probe failure on an existing converted MP4.

These should surface as `AppError` instances with explicit codes/messages so failures remain actionable in logs.

## Testing

Add tests in `tests/youtube.test.ts` that cover:

- Existing H.264 MP4 returns unchanged and does not trigger conversion.
- Existing non-H.264 MP4 triggers conversion and returns the converted path.
- Existing valid `*.h264.mp4` is reused and conversion is skipped.

The tests should mock command execution rather than invoking real ffmpeg binaries. The implementation should therefore introduce a narrow internal seam that can be exercised in unit tests without changing the public API unnecessarily.

## Scope Boundaries

In scope:

- Probe actual MP4 codec after reuse/download.
- Convert only when the final file is not H.264.
- Reuse existing converted H.264 files.
- Return the converted file for downstream use.

Out of scope:

- Deleting original non-H.264 MP4 files.
- Backfilling old output directories outside the current run.
- Changing subtitle or thumbnail handling.
- Adding UI changes or metadata schema changes beyond the existing `videoFile` path behavior.
