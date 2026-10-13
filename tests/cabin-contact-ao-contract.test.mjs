import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as preparation from "../scripts/prepare-cabin.mjs";
import {
  CABIN_URL,
  CABIN_PROXY_URL,
} from "../src/components/three/cabinPreview";
const source = readFileSync(
  "qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const raw = gunzipSync(source),
  json = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
test("preserves the accepted combined source while the diagnostic URL is separately versioned", () => {
  expect(preparation.CABIN_CONTACT_AO_ASSET).toEqual({
    path: "/models/r35-cabin-contact-ao-static-faces-8645956f.glb",
    bytes: 20195752,
    sha256: "8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452",
    gzipBytes: 10194084,
    gzipSha256:
      "efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16",
  });
  expect(CABIN_URL).toBe(preparation.CABIN_FINE_ROUGHNESS_ASSET.path);
  expect(CABIN_URL).not.toBe(preparation.CABIN_CONTACT_AO_ASSET.path);
  expect(CABIN_PROXY_URL).toBe(preparation.CABIN_PROXY_ASSET.path);
  expect(preparation.CABIN_SHA256).toBe(
    "5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326",
  );
});
test("verifies both compressed and decoded identity before admission and rejects other known cabin sources", () => {
  expect(preparation.decodeCabinContactAo).toBeTypeOf("function");
  expect(preparation.decodeCabinContactAo(source).equals(raw)).toBe(true);
  expect(hash(source)).toBe(preparation.CABIN_CONTACT_AO_ASSET.gzipSha256);
  expect(hash(raw)).toBe(preparation.CABIN_CONTACT_AO_ASSET.sha256);
  const corrupt = Buffer.from(source);
  corrupt[20] ^= 1;
  for (const value of [
    corrupt,
    source.subarray(0, -1),
    Buffer.concat([source, Buffer.from([0])]),
    readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz"),
  ]) {
    expect(() => preparation.decodeCabinContactAo(value)).toThrow(/checksum/i);
  }
});
test("pins full indexed triangle totals, eleven embedded images and AO UV3 without expanding draw primitives", () => {
  const primitives = json.meshes.flatMap((mesh) => mesh.primitives);
  expect(primitives).toHaveLength(309);
  expect(
    primitives.reduce(
      (total, primitive) => total + json.accessors[primitive.indices].count / 3,
      0,
    ),
  ).toBe(505664);
  expect(json.materials).toHaveLength(46);
  expect(json.images).toHaveLength(11);
  expect(
    json.images.every(
      (image) => Number.isInteger(image.bufferView) && !image.uri,
    ),
  ).toBe(true);
  const ao = primitives.filter(
    (primitive) => json.materials[primitive.material].occlusionTexture,
  );
  expect(ao).toHaveLength(105);
  for (const primitive of ao) {
    const uv = json.accessors[primitive.attributes.TEXCOORD_3];
    expect(uv).toMatchObject({
      componentType: 5123,
      type: "VEC2",
      normalized: true,
    });
    expect(json.materials[primitive.material].occlusionTexture).toMatchObject({
      texCoord: 3,
      strength: 0.65,
    });
  }
  const baseline = gunzipSync(
    readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz"),
  );
  const previous = JSON.parse(
    baseline.subarray(20, 20 + baseline.readUInt32LE(12)),
  );
  expect(
    previous.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((n, p) => n + previous.accessors[p.indices].count / 3, 0),
  ).toBe(508950);
});
