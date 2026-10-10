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
  "0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83";
const gzipSha =
  "b40071d2f5f2e57af9891697c8cb73ca1d57c10b0f1cc3c3dc3d9c097b1aa5dd";
export function decodeCabin(gzip) {
  if (
    gzip.length !== 9758286 ||
    createHash("sha256").update(gzip).digest("hex") !== gzipSha
  )
    throw new Error("Cabin source checksum mismatch");
  const bytes = gunzipSync(gzip, { maxOutputLength: 18848516 });
  validateGlb(bytes, {
    bytes: 18848516,
    sha256: CABIN_SHA256,
    path: "/models/r35-cabin-realism-0b72bab4.glb",
  });
  return bytes;
}
async function prepareCabin() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const source = resolve(root, "qa/cabin-preview/r35-cabin-realism.glb.gz");
  if (!(await lstat(source)).isFile())
    throw new Error("Cabin source must be a regular file");
  const bytes = decodeCabin(await readFile(source));
  const directory = resolve(root, "public/models");
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Cabin output must be a regular directory");
  const output = resolve(directory, "r35-cabin-realism-0b72bab4.glb");
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
