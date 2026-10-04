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
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";

const id = "rock_moss_set_01";
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xd9,
]);
const payloads = new Map([
  [
    `${id}_1k.gltf`,
    Buffer.from(
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: `${id}.bin`, byteLength: 12 }],
        images: ["diff", "rough", "nor_gl"].map((map) => ({
          uri: `textures/${id}_${map}_1k.jpg`,
        })),
      }),
    ),
  ],
  [`${id}.bin`, Buffer.alloc(12)],
  ...["diff", "rough", "nor_gl"].map((map) => [
    `textures/${id}_${map}_1k.jpg`,
    jpeg,
  ]),
]);
const files = [...payloads].map(([file, bytes]) => ({
  file,
  bytes: bytes.length,
  sha256: checksum(bytes),
  sourceDownloadUrl: `https://dl.polyhaven.org/file/ph-assets/Models/${file.endsWith(".jpg") ? "jpg/1k" : file.endsWith(".bin") ? "gltf/8k" : "gltf/1k"}/${id}/${file.split("/").at(-1)}`,
}));
const manifest = {
  id,
  name: "Rock Moss Set 01",
  path: `/environments/roadside/${id}_1k.gltf`,
  sourceUrl: `https://polyhaven.com/a/${id}`,
  license: "CC0-1.0",
  licenseUrl: "https://polyhaven.com/license",
  authors: { "Kless Gyzen": "All" },
  files,
};
const implementation = () => import("../scripts/fetch-roadside.mjs");
const directories = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "gtr-roadside-test-"));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const noNetwork = () => {
  throw new Error("Unexpected network access");
};
const options = (directory, fetchImpl = noNetwork) => ({
  directory,
  fetchImpl,
  timeoutMs: 100,
  log: () => {},
});
const responseFor = (url) =>
  new Response(
    payloads.get(files.find((file) => file.sourceDownloadUrl === url)?.file),
  );

describe("pinned scanned roadside rock assets", () => {
  it("runs the production CLI with the checked-in manifest filename and an offline verified cache", async () => {
    const dir = await directory();
    await mkdir(join(dir, "scripts"));
    const root = join(dir, "public/environments");
    await mkdir(join(root, "roadside/textures"), { recursive: true });
    await writeFile(
      join(dir, "scripts/fetch-roadside.mjs"),
      await readFile(new URL("../scripts/fetch-roadside.mjs", import.meta.url)),
    );
    await writeFile(join(root, "roadside.json"), JSON.stringify(manifest));
    for (const [file, bytes] of payloads)
      await writeFile(join(root, "roadside", file), bytes);
    const { stdout } = await promisify(execFile)(process.execPath, [
      join(dir, "scripts/fetch-roadside.mjs"),
    ]);
    expect(stdout).toMatch(/ready: 5 pinned model files/);
    expect(stdout).not.toMatch(/fetching/);
  });
  it("requires exactly the five credited official glTF dependency files", async () => {
    const { validateManifest } = await implementation();
    expect(validateManifest(manifest)).toBe(manifest);
    const published = JSON.parse(
      await readFile(
        new URL("../public/environments/roadside.json", import.meta.url),
        "utf8",
      ),
    );
    expect(validateManifest(published).files).toHaveLength(5);
    expect(published.authors).toEqual({ "Kless Gyzen": "All" });
    expect(published.files.reduce((sum, file) => sum + file.bytes, 0)).toBe(
      1937065,
    );
  });
  it.each([
    { id: "../outside" },
    { path: "/environments/../outside.gltf" },
    { license: "unknown" },
    { licenseUrl: "https://example.test/license" },
    { authors: {} },
    { sourceUrl: "https://evil.test/" },
    { files: files.slice(1) },
    { files: [...files, files[0]] },
  ])(
    "rejects unsafe model metadata %j before network or write",
    async (change) => {
      const { prepareRoadside } = await implementation();
      const dir = await directory();
      await expect(
        prepareRoadside({ ...manifest, ...change }, options(dir)),
      ).rejects.toThrow(/manifest/i);
      expect(await readdir(dir)).toEqual([]);
    },
  );
  it.each([
    { file: "../outside.gltf" },
    { file: "textures/../../outside.jpg" },
    { file: "textures%2foutside.jpg" },
    { file: "textures\\outside.jpg" },
    { bytes: 0 },
    { bytes: 16 * 1024 * 1024 + 1 },
    { sha256: "wrong" },
    ...["http://", "https://user:secret@", "https://"]
      .slice(0, 2)
      .map((prefix) => ({
        sourceDownloadUrl: files[0].sourceDownloadUrl.replace(
          "https://",
          prefix,
        ),
      })),
    {
      sourceDownloadUrl: files[0].sourceDownloadUrl.replace(
        "dl.polyhaven.org",
        "dl.polyhaven.org.evil.test",
      ),
    },
    { sourceDownloadUrl: `${files[0].sourceDownloadUrl}?secret=1` },
    { sourceDownloadUrl: `${files[0].sourceDownloadUrl}#fragment` },
    {
      sourceDownloadUrl: files[0].sourceDownloadUrl.replace(
        ".org/",
        ".org:443/",
      ),
    },
  ])("rejects unsafe file pin %j", async (change) => {
    const { validateManifest } = await implementation();
    expect(() =>
      validateManifest({
        ...manifest,
        files: [{ ...files[0], ...change }, ...files.slice(1)],
      }),
    ).toThrow(/manifest/i);
  });
  it("checks exact bytes, SHA-256 and image markers", async () => {
    const { validateAsset } = await implementation();
    const file = files[2];
    expect(() => validateAsset(jpeg, file, manifest)).not.toThrow();
    expect(() => validateAsset(jpeg.subarray(1), file, manifest)).toThrow(
      /byte/i,
    );
    expect(() =>
      validateAsset(Buffer.alloc(jpeg.length), file, manifest),
    ).toThrow(/SHA-256/i);
    const invalid = Buffer.alloc(jpeg.length);
    expect(() =>
      validateAsset(invalid, { ...file, sha256: checksum(invalid) }, manifest),
    ).toThrow(/JPEG/i);
  });
  it.each([
    "https://evil.test/a.bin",
    "//evil.test/a.bin",
    "../outside.bin",
    "data:application/octet-stream;base64,AAAA",
    "rock_moss_set_01.bin?x=1",
    "textures%2foutside.bin",
  ])("rejects glTF dependency escape %s", async (uri) => {
    const { validateAsset } = await implementation();
    const gltf = JSON.parse(payloads.get(files[0].file));
    gltf.buffers[0].uri = uri;
    const bytes = Buffer.from(JSON.stringify(gltf));
    expect(() =>
      validateAsset(
        bytes,
        { ...files[0], bytes: bytes.length, sha256: checksum(bytes) },
        manifest,
      ),
    ).toThrow(/dependency/i);
  });
  it("rejects unpinned glTF images and extension loaders", async () => {
    const { validateAsset } = await implementation();
    for (const patch of [
      { images: [{ uri: "textures/unknown.jpg" }] },
      { extensionsRequired: ["KHR_draco_mesh_compression"] },
    ]) {
      const bytes = Buffer.from(
        JSON.stringify({
          ...JSON.parse(payloads.get(files[0].file)),
          ...patch,
        }),
      );
      expect(() =>
        validateAsset(
          bytes,
          { ...files[0], bytes: bytes.length, sha256: checksum(bytes) },
          manifest,
        ),
      ).toThrow(/dependency|extension/i);
    }
  });
  it("downloads verified originals with same-origin runtime paths and reuses cache offline", async () => {
    const { prepareRoadside } = await implementation();
    const dir = await directory();
    const result = await prepareRoadside(
      manifest,
      options(dir, async (url, init) => {
        expect(init.redirect).toBe("error");
        expect(init.credentials).toBe("omit");
        return responseFor(url);
      }),
    );
    expect(result.map((value) => value.status)).toEqual(
      files.map(() => "downloaded"),
    );
    const times = await Promise.all(
      files.map((file) => stat(join(dir, file.file)).then((s) => s.mtimeMs)),
    );
    expect(
      (await prepareRoadside(manifest, options(dir))).every(
        (value) => value.status === "verified",
      ),
    ).toBe(true);
    expect(
      await Promise.all(
        files.map((file) => stat(join(dir, file.file)).then((s) => s.mtimeMs)),
      ),
    ).toEqual(times);
    for (const file of files)
      expect(await readFile(join(dir, file.file))).toEqual(
        payloads.get(file.file),
      );
  });
  it("repairs corrupt cache without changing verified neighbours", async () => {
    const { prepareRoadside } = await implementation();
    const dir = await directory();
    await prepareRoadside(manifest, options(dir, responseFor));
    await writeFile(join(dir, files[1].file), "bad");
    const result = await prepareRoadside(
      manifest,
      options(dir, (url) => {
        expect(url).toBe(files[1].sourceDownloadUrl);
        return responseFor(url);
      }),
    );
    expect(result.map((value) => value.status)).toEqual([
      "verified",
      "downloaded",
      "verified",
      "verified",
      "verified",
    ]);
  });
  it.each([
    [
      "HTTP error",
      () => new Response("unavailable", { status: 503 }),
      /HTTP 503/,
    ],
    ["redirect", () => new Response(null, { status: 302 }), /HTTP 302/],
    ["checksum", () => new Response(Buffer.alloc(files[0].bytes)), /SHA-256/],
    [
      "truncated",
      () => new Response(payloads.get(files[0].file).subarray(1)),
      /byte/i,
    ],
    [
      "oversize",
      () => new Response(Buffer.alloc(files[0].bytes + 1)),
      /exceed/i,
    ],
    [
      "wrong length",
      () =>
        new Response(payloads.get(files[0].file), {
          headers: { "content-length": "123" },
        }),
      /Content-Length/,
    ],
  ])(
    "never publishes partial or unchecked bytes after %s",
    async (_label, response, error) => {
      const { prepareRoadside } = await implementation();
      const dir = await directory();
      await writeFile(join(dir, files[0].file), "old");
      await expect(
        prepareRoadside(manifest, options(dir, response)),
      ).rejects.toThrow(error);
      expect(await readFile(join(dir, files[0].file), "utf8")).toBe("old");
      expect(await readdir(dir)).toEqual([files[0].file]);
    },
  );
  it("rejects symlink files and nested texture directories", async () => {
    const { prepareRoadside } = await implementation();
    const dir = await directory();
    const other = await directory();
    await writeFile(join(other, "target"), "untouched");
    await symlink(join(other, "target"), join(dir, files[0].file));
    await expect(prepareRoadside(manifest, options(dir))).rejects.toThrow(
      /non-regular/i,
    );
    await rm(join(dir, files[0].file));
    await symlink(other, join(dir, "textures"));
    await expect(
      prepareRoadside(manifest, options(dir, responseFor)),
    ).rejects.toThrow(/directory/i);
    expect(await readFile(join(other, "target"), "utf8")).toBe("untouched");
  });
  it("bounds stalled response bodies and unresponsive requests", async () => {
    const { prepareRoadside } = await implementation();
    for (const fetchImpl of [
      () => new Promise(() => {}),
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array([1]));
            },
          }),
        ),
    ]) {
      const dir = await directory();
      await expect(
        prepareRoadside(manifest, {
          ...options(dir, fetchImpl),
          timeoutMs: 15,
        }),
      ).rejects.toThrow(/timed out/i);
      expect(await readdir(dir)).toEqual([]);
    }
  });
  it.each([0, -1, NaN, 0.5, 300001])(
    "rejects invalid timeout %j",
    async (timeoutMs) => {
      const { prepareRoadside } = await implementation();
      await expect(
        prepareRoadside(manifest, { ...options(await directory()), timeoutMs }),
      ).rejects.toThrow(/timeout/i);
    },
  );
});

describe("metre-scale scanned rock instances", () => {
  it("anchors each selected rock at ground level without changing shared PBR or UV data", async () => {
    const { createRoadsideRockInstances } =
      await import("../src/components/three/RoadsideRocks");
    const source = new Group();
    const geometry = new BoxGeometry(2, 3, 4);
    const material = new MeshStandardMaterial({ roughness: 0.8 });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(7, 5, -3);
    source.add(mesh);
    source.updateMatrixWorld(true);
    const group = createRoadsideRockInstances(source, [
      { position: [20, 1, 10], rotation: 0, scale: 2 },
    ]);
    const bounds = new Box3().setFromObject(group);
    expect(bounds.min.toArray()).toEqual([18, 1, 6]);
    expect(bounds.getSize(new Vector3()).toArray()).toEqual([4, 6, 8]);
    let clone;
    group.traverse((object) => {
      if (object.isMesh) clone = object;
    });
    expect(clone.geometry).toBe(geometry);
    expect(clone.material).toBe(material);
    expect(clone.castShadow).toBe(true);
    expect(clone.receiveShadow).toBe(true);
    expect(mesh.position.toArray()).toEqual([7, 5, -3]);
    expect(mesh.parent).toBe(source);
  });
  it("selects varied source rocks and shares resources across instances", async () => {
    const { createRoadsideRockInstances } =
      await import("../src/components/three/RoadsideRocks");
    const source = new Group();
    for (let i = 1; i <= 2; i++)
      source.add(
        new Mesh(new BoxGeometry(i, i, i), new MeshStandardMaterial()),
      );
    const group = createRoadsideRockInstances(source, [
      { position: [0, 0, 0], variant: 1 },
      { position: [5, 0, 0], variant: 1 },
    ]);
    const meshes = [];
    group.traverse((object) => {
      if (object.isMesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(2);
    expect(meshes[0].geometry).toBe(source.children[1].geometry);
    expect(meshes[0].material).toBe(meshes[1].material);
    expect(
      new Box3()
        .setFromObject(group.children[0])
        .getSize(new Vector3())
        .toArray(),
    ).toEqual([2, 2, 2]);
  });
  it("preserves baked glTF world orientation when separating source rock nodes", async () => {
    const { createRoadsideRockInstances } =
      await import("../src/components/three/RoadsideRocks");
    const source = new Group();
    source.rotation.x = -Math.PI / 2;
    source.add(new Mesh(new BoxGeometry(2, 3, 4), new MeshStandardMaterial()));
    const group = createRoadsideRockInstances(source, [
      { position: [0, 0, 0] },
    ]);
    const size = new Box3().setFromObject(group).getSize(new Vector3());
    expect(size.x).toBeCloseTo(2);
    expect(size.y).toBeCloseTo(4);
    expect(size.z).toBeCloseTo(3);
  });
});
