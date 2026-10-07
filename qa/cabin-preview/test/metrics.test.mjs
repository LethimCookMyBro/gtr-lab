import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSamples, createFrameSample } from '../viewer/metrics.js';
import { captureEvidenceChecks, withCaptureDeadline } from '../viewer/runtime-core.js';

test('capture-stage deadline bounds an unresolved operation and preserves normal results',async()=>{
  assert.equal(await withCaptureDeadline(Promise.resolve(42),'ready',100),42);
  await assert.rejects(withCaptureDeadline(new Promise(()=>{}),'GPU completion',5),{name:'CaptureStageTimeout'});
  const original=new Error('original failure');
  await assert.rejects(withCaptureDeadline(Promise.reject(original),'render',100),error=>error===original);
});

test('capture evidence requires one fresh GPU-completed frame and no state change while paused',()=>{
  const before={ready:true,loadGeneration:2,modelGeneration:2,model:'runtime',capturePaused:true,captureFrameSerial:3,continuousFrameSerial:7,camera:{position:[1,2,3]},glass:true,cabinOnly:false,appearance:{paint:'#fff',lights:false},canvas:{width:100,height:100},bounds:{x:0,y:0,width:100,height:100}};
  const after={...before,captureFrameSerial:4};
  assert.ok(Object.values(captureEvidenceChecks(before,after)).every(Boolean));
  for(const changed of [{captureFrameSerial:3},{continuousFrameSerial:8},{capturePaused:false},{loadGeneration:3},{camera:{position:[2,2,3]}},{bounds:{x:1,y:0,width:100,height:100}},{appearance:{paint:'#000',lights:false}}]) {
    assert.ok(Object.values(captureEvidenceChecks(before,{...after,...changed})).some(value=>!value));
  }
});

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
