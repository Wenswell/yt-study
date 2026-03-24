import { describe, expect, it } from "vitest";
import { parseSubtitleFile } from "../src/services/subtitles.js";

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

  it("parses SRT timestamps and strips cue noise", () => {
    const segments = parseSubtitleFile(`1
00:00:00,000 --> 00:00:02,000
<i>Hello</i> [Music]

2
00:00:02,000 --> 00:00:04,000
world&nbsp;again
`);

    expect(segments).toEqual([
      { startMs: 0, endMs: 2000, text: "Hello" },
      { startMs: 2000, endMs: 4000, text: "world again" }
    ]);
  });
});
