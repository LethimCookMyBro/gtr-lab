import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationIdentity, summarizePhases, main } from '../scripts/diagnose-dpr-motion.mjs';
test('calling driver outside approved CI fails before imports or setup', async () => {
  await assert.rejects(main({}), /CI-only/);
});
test('source identity covers every src file and production entry/config/lock files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpr-identity-'));
  try {
    await mkdir(join(root, 'src'));
    for (const name of ['src/a.ts', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs']) await writeFile(join(root, name), name);
    const before = await applicationIdentity(root); assert.equal(before.files.length, 6);
    await writeFile(join(root, 'src/a.ts'), 'changed'); const after = await applicationIdentity(root); assert.notEqual(before.sha256, after.sha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('phase summaries preserve pixels and draw distributions without FPS acceptance threshold', () => {
  const observation = { phases: [{ name: 'orbit', stable: true }], dimensions: [{ phase: 'orbit', width: 100, height: 50 }, { phase: 'orbit', width: 60, height: 30 }], events: [{ kind: 'canvas-write', phase: 'orbit' }] };
  const resources = { contexts: [{ id: 1, sceneCanvas: true }], frames: [{ phase: 'orbit', contextId: 1, timestamp: 10, calls: 500, triangles: 800000 }, { phase: 'orbit', contextId: 1, timestamp: 1010, calls: 32, triangles: 20000 }] };
  const [summary] = summarizePhases(observation, resources);
  assert.equal(summary.backingPixels.max, 5000); assert.equal(summary.backingPixels.min, 1800); assert.equal(summary.drawCalls.max, 500); assert.equal(summary.triangles.max, 800000); assert.equal(summary.observedFrameSpacingMs.max, 1000); assert.equal(summary.canvasWrites, 1);
  assert.equal('fpsPass' in summary, false);
});
test('new workflow and driver keep normal motion, guard-before-runtime and bounded proof', async () => {
  const source = await readFile(new URL('../scripts/diagnose-dpr-motion.mjs', import.meta.url), 'utf8');
  assert(source.indexOf('validateMotionEnvironment(env)') < source.indexOf("await import('@playwright/test')"));
  assert.match(source, /reducedMotion: 'no-preference'/); assert.doesNotMatch(source, /reducedMotion: 'reduce'|animations: 'disabled'|preserveDrawingBuffer|readPixels\(/);
  assert.match(source, /timeout: 45_000/); assert.match(source, /waitForTimeout\(4000\)/);
  const workflow = await readFile(new URL('../.github/workflows/dpr-motion-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:/); assert.match(workflow, /\[stage-dpr-motion\]/); assert.match(workflow, /resolveMotionRequest/); assert.doesNotMatch(workflow, /workflow_dispatch:/); assert.match(workflow, /GITHUB_REPOSITORY|github.repository/); assert.match(workflow, /persist-credentials: false/);
});
test('optional cabin overlay never waits for an absent exterior-only element', async () => {
  const module = await import('../scripts/diagnose-dpr-motion.mjs');
  assert.equal(typeof module.optionalBoundingBox, 'function');
  const bounds = { x: 1, y: 2, width: 3, height: 4 };
  assert.equal(await module.optionalBoundingBox({ count: async () => 0, boundingBox: () => { throw new Error('must not wait'); } }), null);
  assert.deepEqual(await module.optionalBoundingBox({ count: async () => 1, boundingBox: async () => bounds }), bounds);
});
