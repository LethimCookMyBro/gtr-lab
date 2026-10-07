/** Reconstruct the exact reviewed original cabin; no network or model conversion. */
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
} from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGlb } from "./prepare-models.mjs";
export const CABIN_SHA256 =
  "3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd";
const gzipSha =
  "171fb992e42632d75c87739441c71126e89de3223491a16dc6f0dbb93e1449db";
export function decodeCabin(gzip) {
  if (
    gzip.length !== 7774439 ||
    createHash("sha256").update(gzip).digest("hex") !== gzipSha
  )
    throw new Error("Cabin source checksum mismatch");
  const bytes = gunzipSync(gzip, { maxOutputLength: 14599520 });
  validateGlb(bytes, {
    bytes: 14599520,
    sha256: CABIN_SHA256,
    path: "/models/r35-cabin-sealed-spatial.glb",
  });
  return bytes;
}
async function prepareCabin() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const source = resolve(root, "qa/cabin-preview/r35-sealed-spatial.glb.gz");
  if (!(await lstat(source)).isFile())
    throw new Error("Cabin source must be a regular file");
  const bytes = decodeCabin(await readFile(source));
  const directory = resolve(root, "public/models");
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Cabin output must be a regular directory");
  const output = resolve(directory, "r35-cabin-sealed-spatial.glb");
  const temporary = output + "." + randomUUID() + ".prepared";
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(
    `[cabin] verified original WIP cabin: ${bytes.length} bytes, ${CABIN_SHA256}`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareCabin().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
