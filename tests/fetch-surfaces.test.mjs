import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A small marker-complete JPEG fixture; image decoding is not the build script's job.
const payload = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xd9,
]);
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entry = {
  id: "sample",
  name: "Sample",
  map: "diff",
  resolution: "1k",
  path: "/environments/sample_diff_1k.jpg",
  sourceDownloadUrl:
    "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sample/sample_diff_1k.jpg",
  sourceUrl: "https://polyhaven.com/a/sample",
  license: "CC0-1.0",
  licenseUrl: "https://polyhaven.com/license",
  authors: { "Example Artist": "All" },
  bytes: payload.length,
  sha256: checksum(payload),
};
const implementation = () => import("../scripts/fetch-surfaces.mjs");
const directories = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), "gtr-surfaces-test-"));
  directories.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const options = (directory, fetchImpl) => ({
  directory,
  fetchImpl,
  timeoutMs: 100,
  log: () => {},
});
const noNetwork = () => {
  throw new Error("Unexpected network access");
};

describe("hash-pinned PBR surface preparation", () => {
  it("accepts all thirteen credited official surface map records", async () => {
    const { validateManifest } = await implementation();
    const manifest = JSON.parse(
      await readFile(
        new URL("../public/environments/surfaces.json", import.meta.url),
        "utf8",
      ),
    );
    expect(validateManifest(manifest)).toHaveLength(13);
    expect([...new Set(manifest.map(({ id }) => id))]).toEqual([
      "garage_floor",
      "concrete_wall_008",
      "asphalt_pit_lane",
      "aerial_rocks_02",
    ]);
    for (const asset of manifest) {
      expect(asset).not.toHaveProperty("localPath");
      expect(asset.license).toBe("CC0-1.0");
      expect(Object.keys(asset.authors).length).toBeGreaterThan(0);
    }
  });
  it("pins the matching aerial-rock displacement map and source calibration", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../public/environments/surfaces.json", import.meta.url),
        "utf8",
      ),
    );
    expect(
      manifest.find(
        ({ id, map }) => id === "aerial_rocks_02" && map === "disp",
      ),
    ).toMatchObject({
      path: "/environments/aerial_rocks_02_disp_1k.jpg",
      sourceDownloadUrl:
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_rocks_02/aerial_rocks_02_disp_1k.jpg",
      bytes: 111007,
      sha256:
        "f8df3ed278b28255935d90ef0927cae075445a3a761890df79d3c70b468210ef",
      authors: { "Rob Tuytel": "All" },
      dimensionsMm: [50000, 50000],
      displacementScaleMetres: 5,
      displacementMidlevel: 0.57,
      calibrationSource:
        "https://dl.polyhaven.org/file/ph-assets/Textures/blend/1k/aerial_rocks_02/aerial_rocks_02_1k.blend",
    });
  });
  it("prepares displacement JPEGs with the same pinned-byte verification", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const displacement = {
      ...entry,
      map: "disp",
      path: "/environments/sample_disp_1k.jpg",
      sourceDownloadUrl:
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sample/sample_disp_1k.jpg",
    };
    const result = await ensureSurface(
      displacement,
      options(dir, async () => new Response(payload)),
    );
    expect(result.status).toBe("downloaded");
    expect(await readFile(join(dir, "sample_disp_1k.jpg"))).toEqual(payload);
  });
  it.each([
    { id: "../sample" },
    { map: "../../outside" },
    { resolution: "8k" },
    { path: "/environments/../outside.jpg" },
    { path: "/environments/sample_diff_1k.hdr" },
    { sourceDownloadUrl: entry.sourceDownloadUrl.replace("https:", "http:") },
    {
      sourceDownloadUrl: entry.sourceDownloadUrl.replace(
        "dl.polyhaven.org",
        "dl.polyhaven.org.evil.test",
      ),
    },
    {
      sourceDownloadUrl: entry.sourceDownloadUrl.replace(
        "dl.polyhaven.org",
        "user:secret@dl.polyhaven.org",
      ),
    },
    { sourceDownloadUrl: entry.sourceDownloadUrl + "?token=secret" },
    { sourceDownloadUrl: entry.sourceDownloadUrl + "#fragment" },
    {
      sourceDownloadUrl: entry.sourceDownloadUrl.replace(
        "dl.polyhaven.org",
        "dl.polyhaven.org:443",
      ),
    },
    { bytes: -1 },
    { bytes: 0 },
    { bytes: 16 * 1024 * 1024 + 1 },
    { sha256: "invalid" },
    { license: "unknown" },
    { sourceUrl: "https://example.test/sample" },
  ])("rejects unsafe manifest values %j", async (change) => {
    const { validateManifest } = await implementation();
    expect(() => validateManifest([{ ...entry, ...change }])).toThrow(
      /manifest/i,
    );
  });
  it.each([[], null, {}, [null]].map((manifest) => ({ manifest })))(
    "rejects malformed manifest $manifest",
    async ({ manifest }) => {
      const { validateManifest } = await implementation();
      expect(() => validateManifest(manifest)).toThrow(/manifest/i);
    },
  );
  it("rejects duplicate paths before any download or write", async () => {
    const { prepareSurfaces } = await implementation();
    const dir = await directory();
    await expect(
      prepareSurfaces([entry, entry], options(dir, noNetwork)),
    ).rejects.toThrow(/duplicate/i);
    expect(await readdir(dir)).toEqual([]);
  });
  it("checks byte count, SHA-256, JPEG opening and final markers", async () => {
    const { validateAsset } = await implementation();
    expect(() => validateAsset(payload, entry)).not.toThrow();
    expect(() => validateAsset(payload.subarray(1), entry)).toThrow(/byte/i);
    expect(() => validateAsset(Buffer.alloc(payload.length), entry)).toThrow(
      /SHA-256/i,
    );
    for (const index of [0, 1, 2, payload.length - 2, payload.length - 1]) {
      const damaged = Buffer.from(payload);
      damaged[index] = 0;
      expect(() =>
        validateAsset(damaged, { ...entry, sha256: checksum(damaged) }),
      ).toThrow(/JPEG/i);
    }
  });
  it("preserves a verified cache file, including its modification time, offline", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const file = join(dir, "sample_diff_1k.jpg");
    await writeFile(file, payload);
    const before = await stat(file);
    expect(await ensureSurface(entry, options(dir, noNetwork))).toEqual({
      path: file,
      status: "verified",
    });
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await readFile(file)).toEqual(payload);
  });
  it("downloads a missing asset atomically without redirects or credentials", async () => {
    const { ensureSurface } = await implementation();
    const dir = join(await directory(), "new");
    const result = await ensureSurface(
      entry,
      options(dir, async (url, init) => {
        expect(url).toBe(entry.sourceDownloadUrl);
        expect(init.redirect).toBe("error");
        expect(init.credentials).toBe("omit");
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return new Response(payload, {
          headers: { "content-length": String(payload.length) },
        });
      }),
    );
    expect(result.status).toBe("downloaded");
    expect(await readFile(result.path)).toEqual(payload);
    expect(await readdir(dir)).toEqual(["sample_diff_1k.jpg"]);
  });
  it.each([Buffer.from("corrupt"), Buffer.alloc(payload.length)])(
    "repairs corrupt cached bytes %j",
    async (old) => {
      const { ensureSurface } = await implementation();
      const dir = await directory();
      const file = join(dir, "sample_diff_1k.jpg");
      await writeFile(file, old);
      expect(
        (
          await ensureSurface(
            entry,
            options(dir, async () => new Response(payload)),
          )
        ).status,
      ).toBe("downloaded");
      expect(await readFile(file)).toEqual(payload);
    },
  );
  it.each([
    [
      "HTTP error",
      () => new Response("unavailable", { status: 503 }),
      /HTTP 503/,
    ],
    [
      "redirect",
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.test/" },
        }),
      /HTTP 302/,
    ],
    ["truncation", () => new Response(payload.subarray(0, -1)), /byte/i],
    ["checksum", () => new Response(Buffer.alloc(payload.length)), /SHA-256/],
    [
      "oversize",
      () => new Response(Buffer.alloc(payload.length + 1)),
      /exceed/i,
    ],
    [
      "content length",
      () => new Response(payload, { headers: { "content-length": "999" } }),
      /Content-Length/,
    ],
    ["missing body", () => new Response(null), /body/i],
  ])(
    "never publishes partial data after %s failure",
    async (_name, response, error) => {
      const { ensureSurface } = await implementation();
      const dir = await directory();
      const file = join(dir, "sample_diff_1k.jpg");
      await writeFile(file, "old");
      await expect(
        ensureSurface(
          entry,
          options(dir, async () => response()),
        ),
      ).rejects.toThrow(error);
      expect(await readFile(file, "utf8")).toBe("old");
      expect(await readdir(dir)).toEqual(["sample_diff_1k.jpg"]);
    },
  );
  it("rejects a symlink destination without touching its target", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const target = join(dir, "target.jpg");
    await writeFile(target, payload);
    await symlink(target, join(dir, "sample_diff_1k.jpg"));
    await expect(ensureSurface(entry, options(dir, noNetwork))).rejects.toThrow(
      /non-regular/i,
    );
    expect(await readFile(target)).toEqual(payload);
  });
  it("rejects directory and FIFO destinations without reading or downloading", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const file = join(dir, "sample_diff_1k.jpg");
    await mkdir(file);
    await expect(ensureSurface(entry, options(dir, noNetwork))).rejects.toThrow(
      /non-regular/i,
    );
    await rm(file, { recursive: true });
    if (process.platform !== "win32") {
      await promisify(execFile)("mkfifo", [file]);
      await expect(
        ensureSurface(entry, options(dir, noNetwork)),
      ).rejects.toThrow(/non-regular/i);
    }
  });
  it("rejects a symlink output directory", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const target = join(dir, "real");
    await mkdir(target);
    const link = join(dir, "link");
    await symlink(target, link);
    await expect(
      ensureSurface(entry, options(link, noNetwork)),
    ).rejects.toThrow(/directory/i);
    expect(await readdir(target)).toEqual([]);
  });
  it.each([0, -1, 0.5, NaN, 300001])(
    "rejects invalid or unbounded timeout %j",
    async (timeoutMs) => {
      const { ensureSurface } = await implementation();
      const dir = await directory();
      await expect(
        ensureSurface(entry, { ...options(dir, noNetwork), timeoutMs }),
      ).rejects.toThrow(/timeout/i);
    },
  );
  it("bounds a stalled request even when it ignores the abort signal", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    await expect(
      ensureSurface(entry, {
        ...options(dir, () => new Promise(() => {})),
        timeoutMs: 15,
      }),
    ).rejects.toThrow(/timed out.*15/i);
    expect(await readdir(dir)).toEqual([]);
  });
  it("bounds a stalled response body and preserves the old cache file", async () => {
    const { ensureSurface } = await implementation();
    const dir = await directory();
    const file = join(dir, "sample_diff_1k.jpg");
    await writeFile(file, "old");
    const response = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(payload.subarray(0, 2));
          },
        }),
      );
    await expect(
      ensureSurface(entry, { ...options(dir, response), timeoutMs: 15 }),
    ).rejects.toThrow(/timed out.*15/i);
    expect(await readFile(file, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["sample_diff_1k.jpg"]);
  });
});
