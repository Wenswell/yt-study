import { describe, expect, it } from "vitest";
import { createTranscriptChunks, parseSubtitleFile } from "../src/services/subtitles.js";

describe("parseSubtitleFile", () => {
  it("parses and collapses duplicate VTT cues", () => {
    const segments = parseSubtitleFile(`WEBVTT

00:00:00.000 --> 00:00:02.000
Hello there

00:00:02.000 --> 00:00:04.000
Hello there

00:00:04.000 --> 00:00:06.000
General Kenobi
`);

    expect(segments).toEqual([
      { startMs: 0, endMs: 4000, text: "Hello there" },
      { startMs: 4000, endMs: 6000, text: "General Kenobi" }
    ]);
  });
});

describe("createTranscriptChunks", () => {
  it("splits transcript by target size", () => {
    const segments = [
      { startMs: 0, endMs: 1000, text: "one two three four" },
      { startMs: 1000, endMs: 2000, text: "five six seven eight" },
      { startMs: 2000, endMs: 3000, text: "nine ten eleven twelve" }
    ];

    const chunks = createTranscriptChunks(segments, 30);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].sourceText).toContain("one two");
  });
});
