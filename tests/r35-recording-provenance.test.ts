import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { r35Recording } from "../src/audio/r35Recording";
const root = new URL("../public/audio/", import.meta.url);
describe("authentic recording provenance", () => {
  it("ships the original pinned Ogg without removing its embedded notices", () => {
    const bytes = readFileSync(new URL("nissan-gtr-specv-edvvc.ogg", root));
    expect(bytes.length).toBe(189136);
    expect(bytes.subarray(0, 4).toString()).toBe("OggS");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      r35Recording.sha256,
    );
    expect(bytes.toString("latin1")).toContain("Ed Pond");
    expect(bytes.toString("latin1")).toContain(
      "Attribution-Noncommercial-Share Alike 2.0 UK",
    );
  });
  it("ships author, grant evidence, discrepancy, and playback modifications with the file", () => {
    const attribution = readFileSync(new URL("ATTRIBUTION.txt", root), "utf8");
    expect(attribution).toContain(r35Recording.author);
    expect(attribution).toContain(r35Recording.licenseUrl);
    expect(attribution).toContain("26854850");
    expect(attribution).toContain(
      "Attribution-Noncommercial-Share Alike 2.0 UK",
    );
    expect(attribution).toContain("7.60056689342404");
    expect(attribution).toContain("0.2");
    expect(attribution).toContain("not synchronized");
  });
});
