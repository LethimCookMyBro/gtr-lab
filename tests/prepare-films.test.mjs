import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const script = new URL("../scripts/prepare-films.mjs", import.meta.url);
const run = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const roots = [];
const CHUNK = 64 * 1024;
function mp4(size = CHUNK + 33) {
  const bytes = Buffer.alloc(size, 0x41);
  bytes.writeUInt32BE(24, 0);
  bytes.write("ftypisom", 4);
  bytes.writeUInt32BE(512, 12);
  bytes.write("isomavc1", 16);
  return bytes;
}
async function fixture(payload = mp4()) {
  const root = await mkdtemp(join(tmpdir(), "gtr-film-test-"));
  roots.push(root);
  const directory = join(root, "filmdata");
  const publicDirectory = join(root, "public");
  await mkdir(join(directory, "gtr-hero"), { recursive: true });
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += CHUNK) {
    const bytes = payload.subarray(offset, offset + CHUNK);
    const path = `gtr-hero/${String(chunks.length).padStart(4, "0")}.bin`;
    await writeFile(join(directory, path), bytes);
    chunks.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const entry = {
    id: "gtr-hero",
    path: "/films/gtr-hero.mp4",
    bytes: payload.length,
    sha256: sha256(payload),
    source: {
      title: "Nissan GTR R35",
      author: "Ciasny",
      url: "https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a",
    },
    license: {
      name: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
    changes: [
      "Original CGI lighting and camera animation; licensed model geometry retained.",
    ],
    chunks,
  };
  return {
    root,
    directory,
    publicDirectory,
    payload,
    entry,
    output: join(publicDirectory, "films/gtr-hero.mp4"),
    options: { directory, publicDirectory, log: () => {} },
  };
}
const prepare = async (entries, options) =>
  (await import(script.href)).prepareFilms(entries, options);
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("offline pinned CGI film preparation", () => {
  it("reconstructs the exact MP4 and yields deterministic bytes on repeated runs", async () => {
    const f = await fixture();
    await expect(prepare([f.entry], f.options)).resolves.toEqual([
      { path: f.output, status: "reconstructed" },
    ]);
    expect(await readFile(f.output)).toEqual(f.payload);
    await prepare([f.entry], f.options);
    expect(sha256(await readFile(f.output))).toBe(f.entry.sha256);
    expect(await readdir(join(f.publicDirectory, "films"))).toEqual([
      "gtr-hero.mp4",
    ]);
  });

  it.each([
    ["empty manifest", () => []],
    ["unknown film", (e) => [{ ...e, id: "other", path: "/films/other.mp4" }]],
    ["duplicate output", (e) => [e, e]],
    [
      "traversal destination",
      (e) => [{ ...e, path: "/films/../../outside.mp4" }],
    ],
    ["wrong destination", (e) => [{ ...e, path: "/films/gtr-detail.mp4" }]],
    ["missing provenance", (e) => [{ ...e, source: null }]],
    ["missing author", (e) => [{ ...e, source: { ...e.source, author: "" } }]],
    [
      "credential source URL",
      (e) => [
        {
          ...e,
          source: { ...e.source, url: "https://user:secret@example.com/" },
        },
      ],
    ],
    ["missing license", (e) => [{ ...e, license: null }]],
    [
      "non-HTTPS license",
      (e) => [{ ...e, license: { ...e.license, url: "file:///private" } }],
    ],
    ["missing modification notice", (e) => [{ ...e, changes: [] }]],
    ["invalid hash", (e) => [{ ...e, sha256: "bad" }]],
    ["zero byte size", (e) => [{ ...e, bytes: 0 }]],
    ["unbounded byte size", (e) => [{ ...e, bytes: 2 * 1024 * 1024 + 1 }]],
    ["missing chunks", (e) => [{ ...e, chunks: [] }]],
    [
      "traversal chunk",
      (e) => [
        {
          ...e,
          chunks: [
            { ...e.chunks[0], path: "../../outside" },
            ...e.chunks.slice(1),
          ],
        },
      ],
    ],
    [
      "absolute chunk",
      (e) => [
        {
          ...e,
          chunks: [
            { ...e.chunks[0], path: "/tmp/outside" },
            ...e.chunks.slice(1),
          ],
        },
      ],
    ],
    [
      "Windows chunk",
      (e) => [
        {
          ...e,
          chunks: [
            { ...e.chunks[0], path: "gtr-hero\\0000.bin" },
            ...e.chunks.slice(1),
          ],
        },
      ],
    ],
    ["unordered chunks", (e) => [{ ...e, chunks: [...e.chunks].reverse() }]],
    ["duplicate chunks", (e) => [{ ...e, chunks: [e.chunks[0], e.chunks[0]] }]],
    [
      "bad chunk hash",
      (e) => [
        {
          ...e,
          chunks: [{ ...e.chunks[0], sha256: "bad" }, ...e.chunks.slice(1)],
        },
      ],
    ],
    [
      "oversized chunk",
      (e) => [
        {
          ...e,
          chunks: [{ ...e.chunks[0], bytes: CHUNK + 1 }, ...e.chunks.slice(1)],
        },
      ],
    ],
    [
      "undersized non-final chunk",
      (e) => [
        {
          ...e,
          chunks: [{ ...e.chunks[0], bytes: CHUNK - 1 }, ...e.chunks.slice(1)],
        },
      ],
    ],
    [
      "zero final chunk",
      (e) => [{ ...e, chunks: [e.chunks[0], { ...e.chunks[1], bytes: 0 }] }],
    ],
    ["byte sum mismatch", (e) => [{ ...e, bytes: e.bytes + 1 }]],
  ])("rejects %s before output creation", async (_name, change) => {
    const f = await fixture();
    await expect(prepare(change(f.entry), f.options)).rejects.toThrow(
      /manifest/i,
    );
    await expect(stat(f.publicDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    ["missing", async (file) => rm(file), /missing/i],
    [
      "truncated",
      async (file) => writeFile(file, Buffer.alloc(CHUNK - 1)),
      /byte count/i,
    ],
    [
      "oversized",
      async (file) => writeFile(file, Buffer.alloc(CHUNK + 1)),
      /byte count/i,
    ],
    [
      "corrupt",
      async (file) => writeFile(file, Buffer.alloc(CHUNK)),
      /SHA-256/i,
    ],
    [
      "non-regular",
      async (file) => {
        await rm(file);
        await mkdir(file);
      },
      /regular/i,
    ],
  ])(
    "rejects %s chunks even if the existing output is valid",
    async (_name, mutate, error) => {
      const f = await fixture();
      await mkdir(join(f.publicDirectory, "films"), { recursive: true });
      await writeFile(f.output, f.payload);
      await mutate(join(f.directory, f.entry.chunks[0].path));
      await expect(prepare([f.entry], f.options)).rejects.toThrow(error);
      expect(await readFile(f.output)).toEqual(f.payload);
      expect(await readdir(join(f.publicDirectory, "films"))).toEqual([
        "gtr-hero.mp4",
      ]);
    },
  );

  it("rejects a final checksum mismatch and removes temporary output", async () => {
    const f = await fixture();
    f.entry.sha256 = "0".repeat(64);
    await expect(prepare([f.entry], f.options)).rejects.toThrow(/SHA-256/i);
    await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(join(f.publicDirectory, "films"))).toEqual([]);
  });

  it.each([
    ["magic", (b) => b.write("nope", 4)],
    ["truncated ftyp box", (b) => b.writeUInt32BE(b.length + 1, 0)],
    ["undersized ftyp box", (b) => b.writeUInt32BE(8, 0)],
  ])(
    "rejects invalid MP4 %s with otherwise matching hashes",
    async (_name, mutate) => {
      const payload = mp4();
      mutate(payload);
      const f = await fixture(payload);
      await expect(prepare([f.entry], f.options)).rejects.toThrow(/MP4/i);
      await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it.each([24, CHUNK, 2 * 1024 * 1024])(
    "accepts bounded film size %i",
    async (size) => {
      const f = await fixture(mp4(size));
      await prepare([f.entry], f.options);
      expect(sha256(await readFile(f.output))).toBe(f.entry.sha256);
    },
  );

  it.each([
    "chunk",
    "chunk directory",
    "chunk root",
    "output",
    "output directory",
    "public root",
    "ancestor",
  ])("rejects a symlinked %s", async (target) => {
    const f = await fixture();
    const outside = join(f.root, "outside");
    await mkdir(outside);
    let path;
    if (target === "chunk") {
      path = join(f.directory, f.entry.chunks[0].path);
      const other = join(outside, "chunk.bin");
      await copyFile(path, other);
      await rm(path);
      await symlink(other, path);
    } else if (target === "output") {
      await mkdir(join(f.publicDirectory, "films"), { recursive: true });
      await writeFile(join(outside, "film.mp4"), "untouched");
      path = f.output;
      await symlink(join(outside, "film.mp4"), path);
    } else {
      path = {
        "chunk directory": join(f.directory, "gtr-hero"),
        "chunk root": f.directory,
        "output directory": join(f.publicDirectory, "films"),
        "public root": f.publicDirectory,
        ancestor: join(f.root, "alias"),
      }[target];
      await rm(path, { recursive: true, force: true });
      await mkdir(join(path, ".."), { recursive: true });
      await symlink(outside, path, "dir");
      if (target === "ancestor")
        f.options.publicDirectory = join(path, "public");
    }
    await expect(prepare([f.entry], f.options)).rejects.toThrow(
      /symlink|regular|unsafe/i,
    );
    if (target === "output")
      expect(await readFile(join(outside, "film.mp4"), "utf8")).toBe(
        "untouched",
      );
  });

  it("replaces a hardlinked output atomically without modifying the other link", async () => {
    const f = await fixture();
    await mkdir(join(f.publicDirectory, "films"), { recursive: true });
    const outside = join(f.root, "other.mp4");
    await writeFile(outside, "old");
    await link(outside, f.output);
    await prepare([f.entry], f.options);
    expect(await readFile(outside, "utf8")).toBe("old");
    expect(await readFile(f.output)).toEqual(f.payload);
  });

  it.each(["inside public", "contains public", "same root"])(
    "rejects chunk roots that are %s",
    async (mode) => {
      const f = await fixture();
      f.options.directory =
        mode === "inside public"
          ? join(f.publicDirectory, "chunks")
          : mode === "same root"
            ? f.publicDirectory
            : f.root;
      await expect(prepare([f.entry], f.options)).rejects.toThrow(
        /overlap|outside public/i,
      );
    },
  );

  it("fails the CLI build on a corrupt checked-in chunk", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "scripts"));
    await copyFile(script, join(f.root, "scripts/prepare-films.mjs"));
    await writeFile(
      join(f.directory, "manifest.json"),
      JSON.stringify([f.entry]),
    );
    await writeFile(
      join(f.directory, f.entry.chunks[0].path),
      Buffer.alloc(CHUNK),
    );
    await expect(
      run(process.execPath, [join(f.root, "scripts/prepare-films.mjs")]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/Build stopped/),
    });
    await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
