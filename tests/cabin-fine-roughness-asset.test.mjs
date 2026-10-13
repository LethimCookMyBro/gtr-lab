import { test, expect } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as preparation from "../scripts/prepare-cabin.mjs";
import { CABIN_URL } from "../src/components/three/cabinPreview";
const asset = {
  path: "/models/r35-cabin-fine-roughness-ed88ad0e.glb",
  bytes: 20196108,
  sha256: "ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0",
  gzipBytes: 10194113,
  gzipSha256:
    "b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5",
};
const sourceName = "r35-contact-ao-static-faces-roughness-uv4.glb.gz";
const compressed = readFileSync("qa/cabin-preview/" + sourceName);
const raw = gunzipSync(compressed);
const baseline = gunzipSync(
  readFileSync("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"),
);
const digest = (b) => createHash("sha256").update(b).digest("hex");
const document = (b) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
test("binds the active cabin URL to the accepted fine-roughness asset", () => {
  expect(preparation.CABIN_FINE_ROUGHNESS_ASSET).toEqual(asset);
  expect(CABIN_URL).toBe(asset.path);
  expect(preparation.CABIN_CONTACT_AO_ASSET.sha256).toBe(digest(baseline));
});
test("decodes only the exact compressed and raw fine-roughness identity", () => {
  expect(preparation.decodeCabinFineRoughness).toBeTypeOf("function");
  expect(preparation.decodeCabinFineRoughness(compressed).equals(raw)).toBe(
    true,
  );
  expect(raw.length).toBe(asset.bytes);
  expect(digest(raw)).toBe(asset.sha256);
  expect(compressed.length).toBe(asset.gzipBytes);
  expect(digest(compressed)).toBe(asset.gzipSha256);
  const corrupt = Buffer.from(compressed);
  corrupt[20] ^= 1;
  for (const value of [
    corrupt,
    compressed.subarray(0, -1),
    Buffer.concat([compressed, Buffer.from([0])]),
    readFileSync("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"),
  ]) {
    expect(() => preparation.decodeCabinFineRoughness(value)).toThrow(
      /checksum/i,
    );
  }
});
test("changes only six red ORM transforms and extension registration with exact original binary data", () => {
  const before = document(baseline),
    after = document(raw);
  expect(raw.length - baseline.length).toBe(356);
  expect(
    raw
      .subarray(20 + raw.readUInt32LE(12))
      .equals(baseline.subarray(20 + baseline.readUInt32LE(12))),
  ).toBe(true);
  for (const index of [0, 10, 13, 32, 34, 35]) {
    const pbr = after.materials[index].pbrMetallicRoughness;
    expect(pbr.metallicFactor).toBe(0);
    expect(pbr.roughnessFactor).toBe(0.98);
    expect(pbr.metallicRoughnessTexture).toEqual({
      index: 1,
      texCoord: 2,
      extensions: { KHR_texture_transform: { scale: [4, 4] } },
    });
    expect(after.materials[index].normalTexture.scale).toBe(0.55);
    delete pbr.metallicRoughnessTexture.extensions;
  }
  expect(after.extensionsUsed).toEqual([
    ...before.extensionsUsed,
    "KHR_texture_transform",
  ]);
  after.extensionsUsed = before.extensionsUsed;
  expect(after).toEqual(before);
  expect(after.images).toHaveLength(11);
});
test("ordinary preparation writes exact accepted fine-roughness raw and gzip alongside preserved baseline assets", async () => {
  const root = mkdtempSync(join(tmpdir(), "r35-roughness-prepare-"));
  try {
    mkdirSync(join(root, "qa/cabin-preview"), { recursive: true });
    for (const name of [
      sourceName,
      "r35-cabin-contact-ao-static-faces.glb.gz",
      "r35-cabin-dashboard.glb.gz",
      "r35-exterior-cabin-proxy.glb.gz",
    ])
      copyFileSync(
        "qa/cabin-preview/" + name,
        join(root, "qa/cabin-preview", name),
      );
    await preparation.prepareCabin({ root, log: () => {} });
    const output = join(root, "public", asset.path);
    expect(existsSync(output)).toBe(true);
    expect(readFileSync(output).equals(raw)).toBe(true);
    expect(readFileSync(output + ".gz").equals(compressed)).toBe(true);
    expect(
      digest(
        readFileSync(
          join(root, "public", preparation.CABIN_CONTACT_AO_ASSET.path),
        ),
      ),
    ).toBe(digest(baseline));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
