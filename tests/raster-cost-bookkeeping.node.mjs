/** Production-shaped timer retirement with the byte-identical historical observer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installDrainedKeyObserver } from '../scripts/drained-key-observer.mjs';
import { classifyKeys } from '../scripts/drained-key-gates.mjs';
const original = await readFile(new URL('./drained-key-observer.node.mjs', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(original).digest('hex'), 'dca46b5779d0a37c7de3951da693de3ca96e57ebe2c859b817aa9f8186f1d88b');
const fixtureSource = original.slice(original.indexOf('function fixture('), original.indexOf("test('inserts one fence"));
const fixture = vm.runInNewContext(`${fixtureSource}; fixture;`, { vm, installDrainedKeyObserver });
test('normal timer-side production deleteSync is retained as raw outside-RAF work', () => {
  const f = fixture(); f.api.checkpoint('initial'); f.gl.syncs[0].status = f.gl.ALREADY_SIGNALED; f.tick(50);
  f.api.armKey(1, 1); f.key();
  f.frame(() => { f.gl.drawElements(4, 300, 5123, 0); const own = f.gl.fenceSync(f.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    f.sandbox.setTimeout(() => { assert.equal(f.gl.clientWaitSync(own, 0, 0), f.gl.ALREADY_SIGNALED); f.gl.deleteSync(own); }, 16);
  }, 60);
  f.gl.syncs.forEach(s => s.status = f.gl.ALREADY_SIGNALED); f.tick(76); f.tick(110);
  const o = f.snapshot(), k = classifyKeys(o)[0];
  assert.equal(k.classification, 'one-scene-raf-with-outside-work'); assert.equal(k.actualDrawRafs, 1);
  assert.equal(k.keydown.cleanCheckpoint, true); assert.equal(k.firstPostKeyWork.cleanCheckpoint, true);
  assert.equal(k.outsideWorkAfterKeydown, 1); assert.deepEqual(JSON.parse(JSON.stringify(o.contexts[0].outsideRafMethods)), { deleteSync: 1 });
});
test('late production retirement stales an otherwise completed checkpoint and blocks next key', () => {
  const f = fixture(); f.api.checkpoint('initial'); f.gl.syncs[0].status = f.gl.ALREADY_SIGNALED; f.tick(50);
  f.api.armKey(1, 1); f.key();
  f.frame(() => { f.gl.drawElements(4, 300, 5123, 0); const own = f.gl.fenceSync(f.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    f.sandbox.setTimeout(() => { assert.equal(f.gl.clientWaitSync(own, 0, 0), f.gl.ALREADY_SIGNALED); f.gl.deleteSync(own); }, 110);
  }, 60);
  f.gl.syncs.forEach(s => s.status = f.gl.ALREADY_SIGNALED); f.tick(110);
  f.api.checkpoint('key-1'); f.gl.syncs.at(-1).status = f.gl.ALREADY_SIGNALED; f.tick(160);
  assert.equal(f.snapshot().checkpoints[1].stale, false); f.tick(170);
  assert.equal(f.snapshot().checkpoints[1].staleMethod, 'deleteSync'); assert.throws(() => f.api.armKey(2, 2), /Clean checkpoint/);
});
