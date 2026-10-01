import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../scripts/prepare-models.mjs", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = promisify(execFile);
function minimalGlb() {
  const json = Buffer.from('{"asset":{"version":"2.0"}}');
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const bytes = Buffer.alloc(20 + padded.length);
  bytes.write("glTF", 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(bytes, 20);
  return bytes;
}
const dirs = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gtr-model-test-"));
  dirs.push(root);
  const directory = join(root, "modeldata");
  const publicDirectory = join(root, "public");
  const payload = minimalGlb();
  const chunks = [];
  await mkdir(join(directory, "ciasny-r35"), { recursive: true });
  for (let offset = 0; offset < payload.length; offset += 16) {
    const bytes = payload.subarray(offset, offset + 16);
    const path = `ciasny-r35/${String(chunks.length).padStart(4, "0")}.bin`;
    await writeFile(join(directory, path), bytes);
    chunks.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const entry = {
    id: "ciasny-r35",
    path: "/models/ciasny-r35.glb",
    bytes: payload.length,
    sha256: sha256(payload),
    source: {
      url: "https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a",
      title: "Nissan GTR R35",
      author: "Ciasny",
    },
    license: {
      name: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
    chunks,
  };
  return {
    root,
    directory,
    publicDirectory,
    entry,
    payload,
    output: join(publicDirectory, "models/ciasny-r35.glb"),
    options: { directory, publicDirectory, log: () => {} },
  };
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("offline pinned model preparation", () => {
  it("reconstructs the exact GLB from ordered local chunks", async () => {
    const f = await fixture();
    // A missing implementation is reported as the failed behavior, not collection failure.
    const operation = import(script.href).then(({ prepareModels }) =>
      prepareModels([f.entry], f.options),
    );
    await expect(operation).resolves.toEqual([
      { path: f.output, status: "reconstructed" },
    ]);
    expect(await readFile(f.output)).toEqual(f.payload);
    expect(await readdir(join(f.publicDirectory, "models"))).toEqual([
      "ciasny-r35.glb",
    ]);
  });

  it.each([
    ["empty manifest", () => []],
    [
      "unsafe destination",
      (e) => [{ ...e, path: "/models/../../outside.glb" }],
    ],
    ["duplicate model", (e) => [e, e]],
    ["wrong destination", (e) => [{ ...e, path: "/models/other.glb" }]],
    ["missing source", (e) => [{ ...e, source: null }]],
    ["missing author", (e) => [{ ...e, source: { ...e.source, author: "" } }]],
    ["missing license", (e) => [{ ...e, license: null }]],
    [
      "unsafe source URL",
      (e) => [
        {
          ...e,
          source: { ...e.source, url: "https://user:secret@example.com/model" },
        },
      ],
    ],
    [
      "unsafe license URL",
      (e) => [{ ...e, license: { ...e.license, url: "file:///license" } }],
    ],
    ["invalid hash", (e) => [{ ...e, sha256: "unknown" }]],
    ["invalid size", (e) => [{ ...e, bytes: 0 }]],
    ["unbounded model", (e) => [{ ...e, bytes: 65 * 1024 * 1024 }]],
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
            { ...e.chunks[0], path: "/tmp/0000.bin" },
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
            { ...e.chunks[0], path: "ciasny-r35\\0000.bin" },
            ...e.chunks.slice(1),
          ],
        },
      ],
    ],
    [
      "duplicate chunk",
      (e) => [
        { ...e, chunks: [e.chunks[0], e.chunks[0], ...e.chunks.slice(2)] },
      ],
    ],
    ["wrong chunk order", (e) => [{ ...e, chunks: [...e.chunks].reverse() }]],
    [
      "invalid chunk hash",
      (e) => [
        {
          ...e,
          chunks: [{ ...e.chunks[0], sha256: "bad" }, ...e.chunks.slice(1)],
        },
      ],
    ],
    [
      "zero chunk size",
      (e) => [
        { ...e, chunks: [{ ...e.chunks[0], bytes: 0 }, ...e.chunks.slice(1)] },
      ],
    ],
    [
      "unbounded chunk",
      (e) => [
        {
          ...e,
          chunks: [{ ...e.chunks[0], bytes: 262145 }, ...e.chunks.slice(1)],
        },
      ],
    ],
    ["chunk sum mismatch", (e) => [{ ...e, bytes: e.bytes + 1 }]],
  ])("rejects %s before creating any output", async (_name, change) => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    await expect(prepareModels(change(f.entry), f.options)).rejects.toThrow(
      /manifest/i,
    );
    await expect(stat(f.publicDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    ["truncated chunk", (bytes) => bytes.subarray(0, -1), /byte count/i],
    ["corrupt chunk", (bytes) => Buffer.alloc(bytes.length), /SHA-256/i],
  ])(
    "rejects a %s without replacing an existing file",
    async (_name, change, error) => {
      const f = await fixture();
      const { prepareModels } = await import(script.href);
      await mkdir(join(f.publicDirectory, "models"), { recursive: true });
      await writeFile(f.output, "old");
      await writeFile(
        join(f.directory, f.entry.chunks[0].path),
        change(f.payload.subarray(0, 16)),
      );
      await expect(prepareModels([f.entry], f.options)).rejects.toThrow(error);
      expect(await readFile(f.output, "utf8")).toBe("old");
      expect(await readdir(join(f.publicDirectory, "models"))).toEqual([
        "ciasny-r35.glb",
      ]);
    },
  );

  it("rejects a final checksum mismatch even when every chunk is valid", async () => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    f.entry.sha256 = "0".repeat(64);
    await expect(prepareModels([f.entry], f.options)).rejects.toThrow(
      /SHA-256/i,
    );
    await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["magic", (b) => b.write("nope", 0), /GLB.*magic/i],
    [
      "non-ASCII magic",
      (b) => {
        b[0] |= 0x80;
      },
      /GLB.*magic/i,
    ],
    ["version", (b) => b.writeUInt32LE(1, 4), /GLB.*version/i],
    [
      "declared length",
      (b) => b.writeUInt32LE(b.length + 4, 8),
      /GLB.*length/i,
    ],
    ["chunk length", (b) => b.writeUInt32LE(b.length, 12), /GLB.*chunk/i],
    ["chunk alignment", (b) => b.writeUInt32LE(3, 12), /GLB.*chunk/i],
    ["JSON chunk type", (b) => b.writeUInt32LE(0x004e4942, 16), /GLB.*JSON/i],
    ["JSON contents", (b) => b.fill(0, 20), /GLB.*JSON/i],
  ])(
    "rejects bad GLB %s despite matching checksums",
    async (_name, mutate, error) => {
      const f = await fixture();
      const { prepareModels } = await import(script.href);
      mutate(f.payload);
      f.entry.sha256 = sha256(f.payload);
      for (let i = 0; i < f.entry.chunks.length; i++) {
        const part = f.payload.subarray(i * 16, (i + 1) * 16);
        f.entry.chunks[i].sha256 = sha256(part);
        await writeFile(join(f.directory, f.entry.chunks[i].path), part);
      }
      await expect(prepareModels([f.entry], f.options)).rejects.toThrow(error);
      await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("reuses an existing verified output without reading missing chunks or changing mtime", async () => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    await mkdir(join(f.publicDirectory, "models"), { recursive: true });
    await writeFile(f.output, f.payload);
    const before = await stat(f.output);
    await rm(join(f.directory, "ciasny-r35"), { recursive: true });
    expect(await prepareModels([f.entry], f.options)).toEqual([
      { path: f.output, status: "verified" },
    ]);
    expect((await stat(f.output)).mtimeMs).toBe(before.mtimeMs);
    expect(await readFile(f.output)).toEqual(f.payload);
  });

  it("publishes by atomic replacement, preserving readers of the old inode", async () => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    await mkdir(join(f.publicDirectory, "models"), { recursive: true });
    await writeFile(f.output, "old");
    const oldReader = join(f.root, "old-reader.glb");
    await link(f.output, oldReader);
    await prepareModels([f.entry], f.options);
    expect(await readFile(oldReader, "utf8")).toBe("old");
    expect(await readFile(f.output)).toEqual(f.payload);
    expect(await readdir(join(f.publicDirectory, "models"))).toEqual([
      "ciasny-r35.glb",
    ]);
  });

  it("reports a missing chunk clearly without creating a partial output", async () => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    await rm(join(f.directory, f.entry.chunks[1].path));
    await expect(prepareModels([f.entry], f.options)).rejects.toThrow(
      /missing.*ciasny-r35\/0001.bin/i,
    );
    await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    "chunk",
    "chunk directory",
    "modeldata",
    "models",
    "public",
    "output",
  ])("rejects a symlink at %s without following it", async (target) => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    const outside = join(f.root, "outside");
    await mkdir(outside);
    if (target === "chunk") {
      const destination = join(outside, "part.bin");
      await writeFile(destination, f.payload.subarray(0, 16));
      await rm(join(f.directory, f.entry.chunks[0].path));
      await symlink(destination, join(f.directory, f.entry.chunks[0].path));
    } else if (target === "chunk directory") {
      await rm(join(f.directory, "ciasny-r35"), { recursive: true });
      await symlink(outside, join(f.directory, "ciasny-r35"));
    } else if (target === "modeldata") {
      await rm(f.directory, { recursive: true });
      await symlink(outside, f.directory);
    } else if (target === "public") {
      await symlink(outside, f.publicDirectory);
    } else if (target === "models") {
      await mkdir(f.publicDirectory);
      await symlink(outside, join(f.publicDirectory, "models"));
    } else {
      const destination = join(outside, "model.glb");
      await writeFile(destination, f.payload);
      await mkdir(join(f.publicDirectory, "models"), { recursive: true });
      await symlink(destination, f.output);
    }
    await expect(prepareModels([f.entry], f.options)).rejects.toThrow(
      /symlink|non-regular|unsafe/i,
    );
    if (target === "public" || target === "models")
      expect(await readdir(outside)).toEqual([]);
  });

  it("refuses chunks configured inside the public directory", async () => {
    const f = await fixture();
    const { prepareModels } = await import(script.href);
    await expect(
      prepareModels([f.entry], { ...f.options, publicDirectory: f.root }),
    ).rejects.toThrow(/outside.*public|overlap/i);
    await expect(stat(join(f.root, "models"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("runs the CLI from another working directory using the script's project root", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "scripts"));
    await copyFile(script, join(f.root, "scripts/prepare-models.mjs"));
    await writeFile(
      join(f.directory, "manifest.json"),
      JSON.stringify([f.entry]),
    );
    const { stdout, stderr } = await run(
      process.execPath,
      [join(f.root, "scripts/prepare-models.mjs")],
      { cwd: tmpdir() },
    );
    expect(stderr).toBe("");
    expect(stdout).toMatch(/ready: 1/);
    expect(await readFile(f.output)).toEqual(f.payload);
  });

  it("makes CLI failure fatal with an actionable error", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "scripts"));
    await copyFile(script, join(f.root, "scripts/prepare-models.mjs"));
    await expect(
      run(process.execPath, [join(f.root, "scripts/prepare-models.mjs")]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/Build stopped.*modeldata\/manifest.json/s),
    });
  });

  it("refuses a symlinked manifest at the CLI", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "scripts"));
    await copyFile(script, join(f.root, "scripts/prepare-models.mjs"));
    const outsideManifest = join(f.root, "manifest.json");
    await writeFile(outsideManifest, JSON.stringify([f.entry]));
    await symlink(outsideManifest, join(f.directory, "manifest.json"));
    await expect(
      run(process.execPath, [join(f.root, "scripts/prepare-models.mjs")]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/non-regular/),
    });
    await expect(stat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
