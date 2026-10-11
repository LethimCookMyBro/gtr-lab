import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { decodeCabin, CABIN_SHA256 } from "../scripts/prepare-cabin.mjs";
test("reconstructs only the reviewed textured cabin and rejects tampering", () => {
  const gzip = readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz");
  const actual = decodeCabin(gzip);
  assert.equal(actual.length, 19170816);
  assert.equal(createHash("sha256").update(actual).digest("hex"), CABIN_SHA256);
  assert.deepEqual(actual, gunzipSync(gzip));
  assert.throws(
    () =>
      decodeCabin(readFileSync("qa/cabin-preview/r35-cabin-realism.glb.gz")),
    /checksum/,
  );
  const bad = Buffer.from(gzip);
  bad[20] ^= 1;
  assert.throws(() => decodeCabin(bad), /checksum/);
});

test("publishes only checksum-verified gzip sidecars paired with the exact decoded GLB", async () => {
  const { mkdtemp, mkdir, symlink, readFile, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { prepareCabin, CABIN_PROXY_ASSET } =
    await import("../scripts/prepare-cabin.mjs");
  const root = await mkdtemp(join(tmpdir(), "gtr-precompressed-cabin-"));
  try {
    await mkdir(join(root, "qa"));
    await symlink(
      resolve("qa/cabin-preview"),
      join(root, "qa/cabin-preview"),
      "dir",
    );
    await prepareCabin({ root, log() {} });
    for (const [source, filename, sha] of [
      [
        "r35-cabin-dashboard.glb.gz",
        "r35-cabin-dashboard-5c0a9dca.glb",
        CABIN_SHA256,
      ],
      [
        "r35-exterior-cabin-proxy.glb.gz",
        CABIN_PROXY_ASSET.path.split("/").at(-1),
        CABIN_PROXY_ASSET.sha256,
      ],
    ]) {
      const gzip = await readFile(
        join(root, "public/models", filename + ".gz"),
      );
      assert.deepEqual(
        gzip,
        await readFile(join(root, "qa/cabin-preview", source)),
      );
      const decoded = gunzipSync(gzip);
      assert.equal(createHash("sha256").update(decoded).digest("hex"), sha);
      assert.deepEqual(
        decoded,
        await readFile(join(root, "public/models", filename)),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
