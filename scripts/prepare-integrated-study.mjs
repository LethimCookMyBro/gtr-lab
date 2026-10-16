#!/usr/bin/env node
/** Dedicated optional study namespace; original modeldata contracts are unchanged. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prepareModels } from "./prepare-models.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function prepareIntegratedStudy({
  directory = resolve(root, "studydata"),
  publicDirectory = resolve(root, "public"),
  log = console.log,
} = {}) {
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  return prepareModels(manifest, { directory, publicDirectory, log });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await prepareIntegratedStudy();
  } catch (error) {
    console.error(`[integrated-study] ${error.message}`);
    process.exitCode = 1;
  }
}
