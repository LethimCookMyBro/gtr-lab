import { test, expect } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as preparation from "../scripts/prepare-cabin.mjs";
import { CABIN_URL } from "../src/components/three/cabinPreview";
import { verifyCapNormalCandidate } from "../scripts/shifter-normal/verify-cap-normals.mjs";
const asset = {
  path: "/models/r35-cabin-shifter-cap-normals-e4956add.glb",
  bytes: 20196104,
  sha256: "e4956add0de1f707b8563720bf0e0d5bb5941f0eacfde8f4c21c0784636ae4bf",
  gzipBytes: 10194055,
  gzipSha256:
    "10fccffd8021ba242f576c03f3d9f6ae33575ef73720076fe5899922c638c0da",
};
const sourceName = "r35-cabin-shifter-cap-normals.glb.gz";
const compressed = readFileSync("qa/cabin-preview/" + sourceName),
  raw = gunzipSync(compressed);
const baseline = gunzipSync(
  readFileSync(
    "qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz",
  ),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
test("retains the rejected historical candidate identity while the active cabin is accepted fine", () => {
  expect(preparation.CABIN_SHIFTER_NORMAL_ASSET).toEqual(asset);
  expect(CABIN_URL).toBe(preparation.CABIN_FINE_ROUGHNESS_ASSET.path);
  expect(CABIN_URL).not.toBe(asset.path);
  expect(preparation.CABIN_FINE_ROUGHNESS_ASSET.sha256).toBe(hash(baseline));
});
test("decodes only exact compressed and raw shifter identities", () => {
  expect(preparation.decodeCabinShifterNormal).toBeTypeOf("function");
  expect(preparation.decodeCabinShifterNormal(compressed).equals(raw)).toBe(
    true,
  );
  expect(raw.length).toBe(asset.bytes);
  expect(hash(raw)).toBe(asset.sha256);
  expect(compressed.length).toBe(asset.gzipBytes);
  expect(hash(compressed)).toBe(asset.gzipSha256);
  const corrupt = Buffer.from(compressed);
  corrupt[20] ^= 1;
  for (const b of [
    corrupt,
    compressed.subarray(0, -1),
    Buffer.concat([compressed, Buffer.from([0])]),
    readFileSync(
      "qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz",
    ),
  ])
    expect(() => preparation.decodeCabinShifterNormal(b)).toThrow(/checksum/i);
});
test("changes only the exact 115 cap normals and necessary extrema", () => {
  const proof = verifyCapNormalCandidate(baseline, raw);
  expect(proof.selectedRows).toBe(115);
  expect(proof.changedBinaryBytes).toBe(1108);
  expect(proof.allowedNormalByteSlots).toBe(1380);
  expect(proof.costs).toMatchObject({
    rawByteDelta: -4,
    binaryAllocationByteDelta: 0,
    vertexDelta: 0,
    indexDelta: 0,
    triangleDelta: 0,
    materialDelta: 0,
    textureDelta: 0,
    imageDelta: 0,
    primitiveDelta: 0,
    renderPassDelta: 0,
    residentPrimitives: 309,
    indexedTriangles: 505664,
    imageDefinitions: 11,
  });
  expect(proof.images).toHaveLength(11);
});
test.each(["present", "absent", "corrupt"])(
  "ordinary preparation omits the rejected candidate when its diagnostic fixture is %s",
  async (fixture) => {
    const root = mkdtempSync(join(tmpdir(), "r35-shifter-diagnostic-"));
    try {
      mkdirSync(join(root, "qa/cabin-preview"), { recursive: true });
      for (const name of [
        "r35-contact-ao-static-faces-roughness-uv4.glb.gz",
        "r35-cabin-contact-ao-static-faces.glb.gz",
        "r35-cabin-dashboard.glb.gz",
        "r35-exterior-cabin-proxy.glb.gz",
      ])
        copyFileSync(
          "qa/cabin-preview/" + name,
          join(root, "qa/cabin-preview", name),
        );
      const diagnosticPath = join(root, "qa/cabin-preview", sourceName);
      const fixtureBytes =
        fixture === "present"
          ? compressed
          : Buffer.from("unused rejected diagnostic");
      if (fixture !== "absent") writeFileSync(diagnosticPath, fixtureBytes);
      await preparation.prepareCabin({ root, log: () => {} });
      expect(existsSync(join(root, "public", asset.path))).toBe(false);
      expect(existsSync(join(root, "public", asset.path + ".gz"))).toBe(false);
      expect(
        readFileSync(
          join(root, "public", preparation.CABIN_FINE_ROUGHNESS_ASSET.path),
        ).equals(baseline),
      ).toBe(true);
      expect(readdirSync(join(root, "public/models")).sort()).toEqual([
        "r35-cabin-contact-ao-static-faces-8645956f.glb",
        "r35-cabin-contact-ao-static-faces-8645956f.glb.gz",
        "r35-cabin-dashboard-5c0a9dca.glb",
        "r35-cabin-dashboard-5c0a9dca.glb.gz",
        "r35-cabin-fine-roughness-ed88ad0e.glb",
        "r35-cabin-fine-roughness-ed88ad0e.glb.gz",
        "r35-exterior-cabin-proxy-49d7c2ab.glb",
        "r35-exterior-cabin-proxy-49d7c2ab.glb.gz",
      ]);
      if (fixture !== "absent")
        expect(readFileSync(diagnosticPath).equals(fixtureBytes)).toBe(true);
      else expect(existsSync(diagnosticPath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
