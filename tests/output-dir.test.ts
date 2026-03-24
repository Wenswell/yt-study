import { describe, expect, it } from "vitest";
import { buildOutputDirectoryName } from "../src/lib/output-dir.js";

describe("buildOutputDirectoryName", () => {
  it("uses uploader id, title, and video id", () => {
    expect(buildOutputDirectoryName({
      uploader_id: "demo-channel",
      fulltitle: "Demo Video",
      id: "video123"
    })).toBe("demo-channel[Demo Video](video123)");
  });

  it("sanitizes invalid path characters", () => {
    expect(buildOutputDirectoryName({
      uploader_id: "channel:/name",
      fulltitle: 'Demo <>:"/\\\\|?* Video.',
      id: "video123"
    })).toBe("channel name[Demo Video](video123)");
  });
});
