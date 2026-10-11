/** Source-only derivation; execution never imports a browser or starts a server. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from './cabin-preparation-policy.mjs';
import { deriveQualityReadiness, pins as functionalPins } from './build-selectable-quality-drivers.mjs';
export const pins = Object.freeze({ ...functionalPins,
  'scripts/prepare-cabin.mjs': '6a3d1b017accecffb8f6602bebabc3b871aa8a95b3df49d402e16836cfbd1db2',
  'scripts/causal-motion-preflight.mjs': '35215e7b7cbb376c492349c374101055622deb3cc32d991fc1a9e94703349143',
  'scripts/build-selectable-quality-drivers.mjs': '5e22bfb35be5392853ebbfa071108fec6d2a3385f327c8d083696b96ff0013df',
  'scripts/cabin-resource-observer.mjs': 'c35d627df9e75868925c4c6cce53eb2071ac00ef1030d73b2e97513a10e22caf',
  'scripts/cabin-resource-assertions.mjs': 'de65490919f7cfd479ff35b02826ad66115d2ef8cc13776e2183ad02a8345bea',
  'scripts/causal-cabin-model.mjs': 'd2204b1d4e0a5168eed051dd6d964ee7c5dd170fe5cc5448f305c3c894057a16',
});
export async function buildPreparationReadiness(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  for (const [path, digest] of Object.entries(pins)) assert.equal(sha256(await readFile(resolve(root, path))), digest, `Reviewed helper pin ${path}`);
  // Reuse the independently reviewed quality-only adapter. Buffer-replaced still
  // clears prior actual-main evidence; no frame, deadline, or native-positive rule changes.
  const source = deriveQualityReadiness(await readFile(resolve(root, 'scripts/functional-capture-readiness.mjs')));
  const path = 'scripts/cabin-preparation-readiness.generated.mjs';
  await writeFile(resolve(root, path), source); return { path, sha256: sha256(source) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await buildPreparationReadiness()));
