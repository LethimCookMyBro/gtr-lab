import { test, expect } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as preparation from "../scripts/prepare-cabin.mjs";
import { CABIN_URL } from "../src/components/three/cabinPreview";
const asset = {
  path: "/models/r35-cabin-roughness-control-6e7642a6.glb",
  bytes: 20195752,
  sha256: "6e7642a60783e4f17a65a223dad26a19d47f484f9f156bf7f574e5b1f2447c4b",
  gzipBytes: 10194126,
  gzipSha256:
    "b1051a18e9dba2a9352dbc0696c6469e1e2074f68fc82c7be6991d54928cd9ca",
};
const sourceName = "r35-contact-ao-static-faces-roughness-control.glb.gz";
const compressed = readFileSync("qa/cabin-preview/" + sourceName);
const raw = gunzipSync(compressed);
const baseline = gunzipSync(
  readFileSync("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"),
);
const digest = (b) => createHash("sha256").update(b).digest("hex");
const document = (b) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
test("preserves the rejected constant diagnostic identity separately from the active cabin", () => {
  expect(preparation.CABIN_ROUGHNESS_CONTROL_ASSET).toEqual(asset);
  expect(CABIN_URL).not.toBe(asset.path);
  expect(preparation.CABIN_CONTACT_AO_ASSET.sha256).toBe(digest(baseline));
});
test("decodes only the exact compressed and raw diagnostic identity", () => {
  expect(preparation.decodeCabinRoughnessControl).toBeTypeOf("function");
  expect(preparation.decodeCabinRoughnessControl(compressed).equals(raw)).toBe(
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
    expect(() => preparation.decodeCabinRoughnessControl(value)).toThrow(
      /checksum/i,
    );
  }
});
test("changes only six roughness PBR fields while preserving all binary and other semantic data", () => {
  const before = document(baseline),
    after = document(raw);
  expect(raw.length).toBe(baseline.length);
  expect(raw.readUInt32LE(12)).toBe(baseline.readUInt32LE(12));
  expect(
    raw
      .subarray(20 + raw.readUInt32LE(12))
      .equals(baseline.subarray(20 + baseline.readUInt32LE(12))),
  ).toBe(true);
  for (const index of [0, 10, 13, 32, 34, 35]) {
    const pbr = after.materials[index].pbrMetallicRoughness;
    expect(pbr.metallicFactor).toBe(0);
    expect(pbr.roughnessFactor).toBe((162 / 255) * 0.98);
    expect(pbr.metallicRoughnessTexture).toBeUndefined();
    expect(after.materials[index].normalTexture.scale).toBe(0.55);
    pbr.roughnessFactor =
      before.materials[index].pbrMetallicRoughness.roughnessFactor;
    pbr.metallicRoughnessTexture =
      before.materials[index].pbrMetallicRoughness.metallicRoughnessTexture;
  }
  expect(after).toEqual(before);
  expect(after.images).toHaveLength(11);
});
test.each(["present", "absent", "corrupt"])(
  "ordinary preparation omits the diagnostic when its fixture is %s",
  async (fixture) => {
    const root = mkdtempSync(join(tmpdir(), "r35-roughness-prepare-"));
    try {
      mkdirSync(join(root, "qa/cabin-preview"), { recursive: true });
      for (const name of [
      "r35-cabin-selector-topology.glb.gz",
        "r35-contact-ao-static-faces-roughness-uv4.glb.gz",
        "r35-cabin-contact-ao-static-faces.glb.gz",
        "r35-cabin-dashboard.glb.gz",
        "r35-exterior-cabin-proxy.glb.gz",
      ])
        copyFileSync(
          "qa/cabin-preview/" + name,
          join(root, "qa/cabin-preview", name),
        );
      const fixturePath = join(root, "qa/cabin-preview", sourceName);
      if (fixture !== "absent")
        writeFileSync(
          fixturePath,
          fixture === "present" ? compressed : "unused diagnostic",
        );
      await preparation.prepareCabin({ root, log: () => {} });
      const output = join(root, "public", asset.path);
      expect(existsSync(output)).toBe(false);
      expect(existsSync(output + ".gz")).toBe(false);
      if (fixture !== "absent")
        expect(
          readFileSync(fixturePath).equals(
            fixture === "present"
              ? compressed
              : Buffer.from("unused diagnostic"),
          ),
        ).toBe(true);
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
  },
);
