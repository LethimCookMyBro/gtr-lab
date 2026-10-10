import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { decodeCabin, CABIN_SHA256 } from "../scripts/prepare-cabin.mjs";
test("reconstructs only the reviewed textured cabin and rejects tampering", () => {
  const gzip = readFileSync("qa/cabin-preview/r35-cabin-realism.glb.gz");
  const actual = decodeCabin(gzip);
  assert.equal(actual.length, 18848516);
  assert.equal(createHash("sha256").update(actual).digest("hex"), CABIN_SHA256);
  assert.deepEqual(actual, gunzipSync(gzip));
  const bad = Buffer.from(gzip);
  bad[20] ^= 1;
  assert.throws(() => decodeCabin(bad), /checksum/);
});
