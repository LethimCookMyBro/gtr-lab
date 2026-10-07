import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSamples, createFrameSample } from '../viewer/metrics.js';

test('records a slow current frame rather than reusing an older fast interval', () => {
  assert.equal(createFrameSample(3500, 100, 90, 101, 2000).intervalMs, 3400);
  assert.equal(createFrameSample(100, 0, 90, 101, 2000).intervalMs, null);
});
test('reports measured quantities separately without labeling CPU time as GPU time', () => {
  const result = summarizeSamples([{ intervalMs: 16, renderCpuMs: 3, calls: 101, triangles: 2000 }, { intervalMs: 40, renderCpuMs: 5, calls: 103, triangles: 2100 }]);
  assert.equal(result.samples, 2);
  assert.deepEqual(result.frameIntervalsMs, { min: 16, median: 28, p95: 40, max: 40 });
  assert.deepEqual(result.renderCpuMs, { min: 3, median: 4, p95: 5, max: 5 });
  assert.equal(result.drawCalls.max, 103); assert.equal(result.gpuTimeMs, null);
  assert.ok(Array.isArray(result.frames),'Raw frames are retained');
  assert.equal(result.frames.length,2);
  assert.deepEqual(result.frames[0],{intervalMs:16,renderCpuMs:3,calls:101,triangles:2000});
});
test('empty timing samples stay unknown instead of reporting zero cost', () => {
  const result = summarizeSamples([]);
  assert.equal(result.samples, 0); assert.equal(result.frameIntervalsMs, null); assert.equal(result.renderCpuMs, null);
});
