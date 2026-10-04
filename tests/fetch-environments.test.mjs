import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureEnvironment,
  prepareEnvironments,
  validateAsset,
  validateManifest,
} from "../scripts/fetch-environments.mjs";

const payload = Buffer.from(
  "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n1234",
);
const entry = {
  id: "sample",
  resolution: "1k",
  path: "/environments/sample_1k.hdr",
  sourceDownloadUrl:
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sample_1k.hdr",
  bytes: payload.length,
  sha256: createHash("sha256").update(payload).digest("hex"),
  dimensionsHeader: "-Y 1 +X 1",
};
const dirs = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "gtr-hdri-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const options = (directory, fetchImpl) => ({
  directory,
  fetchImpl,
  timeoutMs: 100,
  log: () => {},
});

describe("pinned environment downloads", () => {
  it("accepts the checked-in manifest and valid HDR bytes", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../public/environments/downloads.json", import.meta.url),
        "utf8",
      ),
    );
    expect(validateManifest(manifest)).toHaveLength(1);
    expect(manifest[0].id).toBe("kloofendal_48d_partly_cloudy_puresky");
    expect(() => validateAsset(payload, entry)).not.toThrow();
  });
  it.each([
    { path: "/environments/../outside.hdr" },
    {
      sourceDownloadUrl:
        "http://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sample_1k.hdr",
    },
    {
      sourceDownloadUrl:
        "https://dl.polyhaven.org.evil.test/file/ph-assets/HDRIs/hdr/1k/sample_1k.hdr",
    },
    {
      sourceDownloadUrl:
        "https://user:secret@dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sample_1k.hdr",
    },
    {
      sourceDownloadUrl:
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sample_1k.hdr?token=secret",
    },
    { sha256: "invalid" },
    { bytes: -1 },
    { bytes: 100 * 1024 * 1024 },
  ])("rejects unsafe or incomplete manifest entry %j", (change) => {
    expect(() => validateManifest([{ ...entry, ...change }])).toThrow(
      /manifest/i,
    );
  });
  it("rejects duplicate destinations before fetching any asset", async () => {
    const dir = await directory();
    await expect(
      prepareEnvironments(
        [entry, entry],
        options(dir, () => {
          throw new Error("unexpected network");
        }),
      ),
    ).rejects.toThrow(/duplicate/i);
    expect(await readdir(dir)).toEqual([]);
  });
  it("rejects incorrect byte size and same-size checksum mismatch", () => {
    expect(() => validateAsset(payload.subarray(1), entry)).toThrow(/byte/i);
    expect(() => validateAsset(Buffer.alloc(payload.length), entry)).toThrow(
      /SHA-256/i,
    );
  });
  it("leaves an already valid file completely untouched and works offline", async () => {
    const dir = await directory();
    const file = join(dir, "sample_1k.hdr");
    await writeFile(file, payload);
    const before = await stat(file);
    const result = await ensureEnvironment(
      entry,
      options(dir, () => {
        throw new Error("unexpected network");
      }),
    );
    expect(result.status).toBe("verified");
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await readFile(file)).toEqual(payload);
  });
  it("fetches a missing asset, verifies it, and leaves no temporary file", async () => {
    const dir = await directory();
    const result = await ensureEnvironment(
      entry,
      options(dir, async (url, init) => {
        expect(url).toBe(entry.sourceDownloadUrl);
        expect(init.redirect).toBe("error");
        expect(init.credentials).toBe("omit");
        return new Response(payload);
      }),
    );
    expect(result.status).toBe("downloaded");
    expect(await readFile(join(dir, "sample_1k.hdr"))).toEqual(payload);
    expect(await readdir(dir)).toEqual(["sample_1k.hdr"]);
  });
  it("replaces a corrupt local file only with verified bytes", async () => {
    const dir = await directory();
    const file = join(dir, "sample_1k.hdr");
    await writeFile(file, "corrupt");
    await ensureEnvironment(
      entry,
      options(dir, async () => new Response(payload)),
    );
    expect(await readFile(file)).toEqual(payload);
  });
  it.each([
    [
      "HTTP 503",
      () => new Response("unavailable", { status: 503 }),
      /HTTP 503/,
    ],
    ["truncated", () => new Response(payload.subarray(0, -1)), /byte/i],
    ["checksum", () => new Response(Buffer.alloc(payload.length)), /SHA-256/],
    [
      "oversized",
      () => new Response(Buffer.alloc(payload.length + 1)),
      /exceed/i,
    ],
    [
      "content length",
      () => new Response(payload, { headers: { "content-length": "999" } }),
      /Content-Length/,
    ],
  ])(
    "preserves old file and cleans up after %s failure",
    async (_name, response, error) => {
      const dir = await directory();
      const file = join(dir, "sample_1k.hdr");
      await writeFile(file, "old");
      await expect(
        ensureEnvironment(
          entry,
          options(dir, async () => response()),
        ),
      ).rejects.toThrow(error);
      expect(await readFile(file, "utf8")).toBe("old");
      expect(await readdir(dir)).toEqual(["sample_1k.hdr"]);
    },
  );
  it("times out a stalled request with a clear error and no partial file", async () => {
    const dir = await directory();
    const stalled = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    await expect(
      ensureEnvironment(entry, { ...options(dir, stalled), timeoutMs: 15 }),
    ).rejects.toThrow(/timed out.*15/i);
    expect(await readdir(dir)).toEqual([]);
  });
});
