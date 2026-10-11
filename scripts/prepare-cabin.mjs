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
  "5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326";
const gzipSha =
  "70036f4c17601909d4c382a0530501618dace139debb55cd966698e89b8b75f5";
export function decodeCabin(gzip) {
  if (
    gzip.length !== 9798606 ||
    createHash("sha256").update(gzip).digest("hex") !== gzipSha
  )
    throw new Error("Cabin source checksum mismatch");
  const bytes = gunzipSync(gzip, { maxOutputLength: 19170816 });
  validateGlb(bytes, {
    bytes: 19170816,
    sha256: CABIN_SHA256,
    path: "/models/r35-cabin-dashboard-5c0a9dca.glb",
  });
  return bytes;
}
async function prepareCabin() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const source = resolve(root, "qa/cabin-preview/r35-cabin-dashboard.glb.gz");
  if (!(await lstat(source)).isFile())
    throw new Error("Cabin source must be a regular file");
  const bytes = decodeCabin(await readFile(source));
  const directory = resolve(root, "public/models");
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Cabin output must be a regular directory");
  const output = resolve(directory, "r35-cabin-dashboard-5c0a9dca.glb");
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
