import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import * as preparation from "../scripts/prepare-cabin.mjs";
import { CABIN_URL } from "../src/components/three/cabinPreview";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = readFileSync(
  "qa/cabin-preview/r35-cabin-contact-ao-static-faces-leather.glb.gz",
);
const baseline = gunzipSync(
  readFileSync("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"),
);
const expected = {
  path: "/models/r35-cabin-contact-ao-static-faces-leather-da354db8.glb",
  bytes: 20195752,
  sha256: "da354db8b3d40bc569e68262d121cc630f9bdf293c10b40071b6b46b0370b06a",
  gzipBytes: 10194086,
  gzipSha256:
    "9fa0fc0b8eb05287e08e54bef81936954e91665f9e34fe95a7c9002aaf33e817",
};
test("binds the active leather material increment to its exact new raw and wire identity", () => {
  expect(preparation.CABIN_LEATHER_ASSET).toEqual(expected);
  expect(CABIN_URL).toBe(expected.path);
  expect(preparation.CABIN_CONTACT_AO_ASSET.sha256).toBe(digest(baseline));
});
test("admits only the pinned leather encoding and rejects corruption, truncation and the baseline", () => {
  expect(preparation.decodeCabinLeather).toBeTypeOf("function");
  const raw = preparation.decodeCabinLeather(source);
  expect(digest(raw)).toBe(expected.sha256);
  expect(raw.length).toBe(expected.bytes);
  expect(digest(source)).toBe(expected.gzipSha256);
  const corrupt = Buffer.from(source);
  corrupt[20] ^= 1;
  for (const bytes of [
    corrupt,
    source.subarray(0, -1),
    Buffer.concat([source, Buffer.from([0])]),
    readFileSync("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"),
  ])
    expect(() => preparation.decodeCabinLeather(bytes)).toThrow(/checksum/i);
});
test("changes exactly six scalar bytes and preserves every other JSON field and the complete BIN", () => {
  const raw = gunzipSync(source);
  const offsets = [321198, 324459, 325941, 332658, 333397, 334021];
  const expectedRaw = Buffer.from(baseline);
  for (const offset of offsets) {
    expect(expectedRaw[offset]).toBe(0x35);
    expectedRaw[offset] = 0x33;
  }
  expect(raw.equals(expectedRaw)).toBe(true);
  const json = (bytes) =>
    JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const before = json(baseline),
    after = json(raw);
  for (const index of [0, 10, 13, 32, 34, 35]) {
    expect(before.materials[index].normalTexture.scale).toBe(0.55);
    expect(after.materials[index].normalTexture.scale).toBe(0.35);
    after.materials[index].normalTexture.scale = 0.55;
  }
  expect(after).toEqual(before);
  expect(
    raw
      .subarray(20 + raw.readUInt32LE(12))
      .equals(baseline.subarray(20 + baseline.readUInt32LE(12))),
  ).toBe(true);
});
test("prepares the canonical raw model and exact gzip sidecar while retaining baseline outputs", async () => {
  const { mkdtemp, mkdir, symlink, readFile, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "gtr-leather-model-"));
  try {
    await mkdir(join(root, "qa"));
    await symlink(
      resolve("qa/cabin-preview"),
      join(root, "qa/cabin-preview"),
      "dir",
    );
    await preparation.prepareCabin({ root, log() {} });
    const filename = expected.path.split("/").at(-1);
    expect(
      (await readFile(join(root, "public/models", filename + ".gz"))).equals(
        source,
      ),
    ).toBe(true);
    expect(digest(await readFile(join(root, "public/models", filename)))).toBe(
      expected.sha256,
    );
    expect(
      digest(
        await readFile(
          join(
            root,
            "public/models",
            preparation.CABIN_CONTACT_AO_ASSET.path.split("/").at(-1),
          ),
        ),
      ),
    ).toBe(digest(baseline));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
