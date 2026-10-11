/** Source verification only. No imports of application, browser, server or sockets. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { baseline, candidate } from './raster-cost-policy.mjs';
export const treatmentPath = 'src/components/three/VehiclePixelDensity.tsx';
export function validateTreatmentText(a, b) {
  const before = 'const MAX_BUFFER_PIXELS = 2_000_000;', after = 'const MAX_BUFFER_PIXELS = 1_000_000;';
  assert.equal(a.split(before).length, 2); assert.equal(b, a.replace(before, after), 'The sole production treatment must be 2M to 1M');
}
export async function verifyRasterSources(a, b) {
  const [original, treatment] = await Promise.all([applicationIdentity(a), applicationIdentity(b)]);
  assert.equal(original.sha256, baseline.tree); assert.equal(treatment.sha256, candidate.tree);
  assert.equal(original.files.length, 93); assert.equal(treatment.files.length, 93);
  assert.deepEqual(original.files.map(f => f.path), treatment.files.map(f => f.path));
  assert.deepEqual(original.files.filter((f, i) => f.sha256 !== treatment.files[i].sha256).map(f => f.path), [treatmentPath]);
  validateTreatmentText(await readFile(resolve(a, treatmentPath), 'utf8'), await readFile(resolve(b, treatmentPath), 'utf8'));
  return { original, treatment, changed: treatmentPath };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Provide baseline and candidate source directories');
  const result = await verifyRasterSources(process.argv[2], process.argv[3]);
  console.log(JSON.stringify({ baseline: result.original.sha256, candidate: result.treatment.sha256, filesPerSource: 93, changed: result.changed }, null, 2));
}
