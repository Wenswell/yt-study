import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/config.js";

describe("parseCliArgs", () => {
  it("defaults output directory to the .yt-study folder", () => {
    const options = parseCliArgs(["--url", "https://www.youtube.com/watch?v=video123"]);

    expect(options.outDir).toBe(path.join(homedir(), "." + "yt-study", "outputs"));
  });

  it("resolves a custom output directory override", () => {
    const options = parseCliArgs([
      "--url",
      "https://www.youtube.com/watch?v=video123",
      "--out-dir",
      "./custom-output"
    ]);

    expect(options.outDir).toBe(path.resolve("custom-output"));
  });
});
