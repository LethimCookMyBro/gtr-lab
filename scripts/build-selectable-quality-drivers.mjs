/** Source-only derivation. Never executes a browser, server, or generated driver. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const hash = value => createHash('sha256').update(value).digest('hex');
export const pins = Object.freeze({
  'scripts/raster-cost-evidence.mjs': 'fe9444220bc251f2f71a3be16af24a08e3a2abc3876113b66e30e94bc3388a2a',
  'scripts/cabin-capture-readiness.mjs': '67accafd0ae7aa55620571318f910c607e9eaaf3b792ba6bc947e093cba80056',
  'scripts/diagnose-dpr-motion.mjs': 'b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110',
  'scripts/dpr-motion-policy.mjs': '33a69e394835ac5592c54c4b1dd278c80b42f3fb8335ee2821a075d5d66ba36b',
  'scripts/dpr-motion-observer.mjs': 'ba4364c76024cd543435fd578b3fdc2def691f935ec30fbf7e3e20f669169aa8',
  'scripts/functional-capture-readiness.mjs': '816f8123344a2ab9f98a2469a81758266fc3d60d69545977dae3e19412a2dffb',
  'scripts/render-backpressure-lifecycle-fixture.mjs': '33dfc365a070a4fceb1d1c73e0b6e7eb0c7b1c6c9a0842f75add6a65d138422d',
  'scripts/diagnose-render-backpressure-lifecycle.mjs': '6e9a43f7046ea586b79d91d7bea6e00f346ed72fd8ed13505e147e380a81a9c6',
  'scripts/environment-pixel-comparison.mjs': '5994eaa59262f1093ec008e441e1247aaa62b20dca8842f254a4f34545d4d958',
});
const one = (source, from, to) => { assert.equal(source.split(from).length, 2, `Unique reviewed anchor: ${from}`); return source.replace(from, to); };
export function deriveQualityMotionDriver(bytes) {
  assert.equal(hash(bytes), pins['scripts/diagnose-dpr-motion.mjs']);
  // Exactly one policy import changes. Every input, sleep, capture, deadline and result stays byte-identical.
  return one(String(bytes), "from './dpr-motion-policy.mjs'", "from './selectable-quality-policy.mjs'");
}
export function deriveQualityReadiness(bytes) {
  assert.equal(hash(bytes), pins['scripts/functional-capture-readiness.mjs']);
  let source = String(bytes);
  assert.equal(source.split('2_000_000').length, 3);
  source = source.replaceAll('2_000_000', 'expected.maxBufferPixels');
  source = one(source, 'const { camera, vehicle, dimensions: d, pose } = snapshot;', `if (![1_000_000, 2_000_000].includes(expected.maxBufferPixels)) throw new Error('Explicit reviewed quality budget required');\n    const { camera, vehicle, dimensions: d, pose } = snapshot;`);
  source = one(source, '{ preset, timeout }) {', '{ preset, timeout, quality }) {');
  source = one(source, '({ preset, timeout }) => {', '({ preset, timeout, quality }) => {\n      if (!["standard", "reduced"].includes(quality)) throw new Error("Explicit quality required");');
  source = one(source, '          preset: seat ? "interior" : preset,', '          maxBufferPixels: quality === "reduced" ? 1_000_000 : 2_000_000,\n          preset: seat ? "interior" : preset,');
  source = one(source, '    { preset, timeout },', '    { preset, timeout, quality },');
  return source;
}
export async function buildQualityDrivers(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  for (const [path, digest] of Object.entries(pins)) assert.equal(hash(await readFile(resolve(root, path))), digest, path);
  const outputs = {
    'scripts/diagnose-selectable-quality-motion.generated.mjs': deriveQualityMotionDriver(await readFile(resolve(root, 'scripts/diagnose-dpr-motion.mjs'))),
    'scripts/selectable-quality-readiness.generated.mjs': deriveQualityReadiness(await readFile(resolve(root, 'scripts/functional-capture-readiness.mjs'))),
  };
  for (const [path, source] of Object.entries(outputs)) await writeFile(resolve(root, path), source);
  return Object.fromEntries(Object.entries(outputs).map(([path, source]) => [path, hash(source)]));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await buildQualityDrivers(), null, 2));
