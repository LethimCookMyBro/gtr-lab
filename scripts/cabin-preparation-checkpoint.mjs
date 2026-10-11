/** Bounded observation only: one existing absolute window, durable immutable outcomes. */
import assert from 'node:assert/strict';
import { remainingBudget } from './cabin-preparation-policy.mjs';
export async function boundedOperation(window, label, work, { now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  assert.equal(typeof work, 'function'); let timer;
  const timeout = remainingBudget(window, now());
  try {
    const result = await Promise.race([Promise.resolve().then(() => { remainingBudget(window, now()); return work(() => remainingBudget(window, now())); }), new Promise((_, reject) => { timer = schedule(() => reject(new Error(`Original operation deadline exceeded: ${label}`)), timeout); })]);
    remainingBudget(window, now()); return result;
  } finally { cancel(timer); }
}
export function createCheckpointRecorder({ row, save, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  row.checkpoints ??= []; let failed = false;
  return async (label, window, work, { cleanup = false } = {}) => {
    assert.ok(!failed || cleanup, 'Failed operation seals dependent actions');
    const record = { label, phase: cleanup ? 'cleanup' : 'action', status: 'started', startedAt: now(), window: { ...window } }; row.checkpoints.push(record); await save();
    try {
      const result = await boundedOperation(window, label, work, { now, schedule, cancel });
      record.status = 'completed'; record.endedAt = now(); await save(); return result;
    } catch (error) {
      failed = true; record.status = 'failed'; record.endedAt = now(); record.error = String(error); row.result = 'failed'; row.errors.push(String(error)); await save(); throw error;
    }
  };
}
