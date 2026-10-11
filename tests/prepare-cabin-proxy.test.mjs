import { afterEach, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import * as preparation from "../scripts/prepare-cabin.mjs";

const path = "/models/r35-exterior-cabin-proxy-49d7c2ab.glb";
const source = "qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz";
const gzip = readFileSync(source);
const raw = gunzipSync(gzip);
const receipt = JSON.parse(
  readFileSync("qa/cabin-preview/exterior-proxy-verification.json", "utf8"),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const directories = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

// Rebuild only an in-memory test GLB so geometry guards are tested independently
// of the earlier immutable-file checksum guard. No fixture bytes are changed.
function changeGeometry(change) {
  const jsonLength = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + jsonLength));
  const binary = Buffer.from(raw.subarray(28 + jsonLength));
  change(json, binary);
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
  encoded.copy(padded);
  const bytes = Buffer.alloc(28 + padded.length + binary.length);
  raw.copy(bytes, 0, 0, 12);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + padded.length);
  bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(bytes, 28 + padded.length);
  return bytes;
}

test("reconstructs the exact reviewed exterior-only proxy with its own content URL", () => {
  expect(preparation.decodeCabinProxy).toBeTypeOf("function");
  const bytes = preparation.decodeCabinProxy(gzip);
  expect(bytes.equals(raw)).toBe(true);
  expect(bytes.length).toBe(956368);
  expect(digest(bytes)).toBe(
    "49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347",
  );
  expect(gzip.length).toBe(616928);
  expect(digest(gzip)).toBe(
    "bd14ba078e08d762158fb3fcc225acae6d2369b7d2c1f2ad1a128f404147733e",
  );
  expect(preparation.CABIN_PROXY_ASSET).toMatchObject({
    path,
    bytes: bytes.length,
    sha256: digest(bytes),
    gzipBytes: gzip.length,
    gzipSha256: digest(gzip),
  });
  expect(receipt).toMatchObject({
    passed: true,
    sha256: digest(bytes),
    bytes: bytes.length,
    gzipSHA256: digest(gzip),
    gzipBytes: gzip.length,
    sourceSHA256: preparation.CABIN_SHA256,
  });
});

test("rejects truncated, appended, tampered and full-cabin gzip inputs", () => {
  const tampered = Buffer.from(gzip);
  tampered[20] ^= 1;
  for (const bytes of [
    tampered,
    gzip.subarray(0, -1),
    Buffer.concat([gzip, Buffer.from([0])]),
    readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz"),
  ]) {
    expect(() => preparation.decodeCabinProxy(bytes)).toThrow(
      /proxy source checksum/i,
    );
  }
});

test("checks actual used vertices, index bounds and the texture-free static proxy budget", () => {
  expect(preparation.inspectCabinProxy).toBeTypeOf("function");
  expect(preparation.inspectCabinProxy(raw)).toEqual({
    meshNodes: 8,
    primitives: 8,
    materials: 8,
    triangles: 37749,
    bounds: receipt.proxyBoundsNative,
  });
  expect(receipt.maxBoundsDeltaMetres).toBeLessThan(0.000513);
});

test.each([
  [
    "source identity",
    (json) => {
      json.asset.extras.sourceSHA256 = "0".repeat(64);
    },
    /source/i,
  ],
  [
    "native transform",
    (json) => {
      json.nodes[0].translation = [0, 0.1, 0];
    },
    /native|transform/i,
  ],
  [
    "shadow casting",
    (json) => {
      json.nodes[0].extras.castShadow = true;
    },
    /shadow/i,
  ],
  [
    "texture payload",
    (json) => {
      json.images = [{ uri: "unexpected.png" }];
    },
    /image|texture/i,
  ],
  [
    "transparent material",
    (json) => {
      json.materials[0].alphaMode = "BLEND";
    },
    /opaque/i,
  ],
  [
    "external buffer",
    (json) => {
      json.buffers[0].uri = "unexpected.bin";
    },
    /buffer/i,
  ],
  [
    "out-of-range index",
    (json, binary) => {
      const a = json.accessors[json.meshes[0].primitives[0].indices];
      binary.writeUInt16LE(65535, json.bufferViews[a.bufferView].byteOffset);
    },
    /index/i,
  ],
  [
    "nonfinite vertex",
    (json, binary) => {
      binary.writeFloatLE(
        NaN,
        json.bufferViews[json.accessors[0].bufferView].byteOffset,
      );
    },
    /finite/i,
  ],
  [
    "zero normal",
    (json, binary) => {
      const offset = json.bufferViews[json.accessors[1].bufferView].byteOffset;
      binary.fill(0, offset, offset + 12);
    },
    /normal/i,
  ],
  [
    "changed native bounds",
    (json, binary) => {
      binary.writeFloatLE(
        100,
        json.bufferViews[json.accessors[0].bufferView].byteOffset,
      );
    },
    /bounds/i,
  ],
])("rejects %s before preparing proxy output", (_name, change, message) => {
  expect(() => preparation.inspectCabinProxy(changeGeometry(change))).toThrow(
    message,
  );
});

test("offline preparation emits byte-identical full and proxy assets on repeated runs", async () => {
  expect(preparation.prepareCabin).toBeTypeOf("function");
  const root = await mkdtemp(join(tmpdir(), "gtr-cabin-proxy-"));
  directories.push(root);
  await mkdir(join(root, "qa/cabin-preview"), { recursive: true });
  for (const name of [
    "r35-cabin-dashboard.glb.gz",
    "r35-cabin-contact-ao-static-faces.glb.gz",
    "r35-exterior-cabin-proxy.glb.gz",
  ]) {
    await copyFile(
      join("qa/cabin-preview", name),
      join(root, "qa/cabin-preview", name),
    );
  }
  for (let run = 0; run < 2; run++) {
    await preparation.prepareCabin({ root, log: () => {} });
    const full = await readFile(
      join(root, "public/models/r35-cabin-dashboard-5c0a9dca.glb"),
    );
    expect(full.length).toBe(19170816);
    expect(digest(full)).toBe(
      "5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326",
    );
    expect((await readFile(join(root, "public", path))).equals(raw)).toBe(true);
    expect((await readdir(join(root, "public/models"))).sort()).toEqual([
      "r35-cabin-contact-ao-static-faces-8645956f.glb",
      "r35-cabin-contact-ao-static-faces-8645956f.glb.gz",
      "r35-cabin-dashboard-5c0a9dca.glb",
      "r35-cabin-dashboard-5c0a9dca.glb.gz",
      "r35-exterior-cabin-proxy-49d7c2ab.glb",
      "r35-exterior-cabin-proxy-49d7c2ab.glb.gz",
    ]);
  }
});
