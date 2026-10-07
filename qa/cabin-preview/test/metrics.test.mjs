import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSamples, createFrameSample } from '../viewer/metrics.js';
import { captureEvidenceChecks, createRenderSchedule, withCaptureDeadline } from '../viewer/runtime-core.js';

test('demand rendering starts with one requested frame and stays idle after submission', () => {
  const schedule = createRenderSchedule();
  assert.deepEqual(schedule.state(), { sceneRevision: 1, renderedSceneRevision: 0, pendingFrames: 1 });
  assert.equal(schedule.needsRender(), true);
  schedule.markSubmitted(schedule.state().sceneRevision);
  assert.deepEqual(schedule.state(), { sceneRevision: 1, renderedSceneRevision: 1, pendingFrames: 0 });
  for (let check = 0; check < 20; check++) assert.equal(schedule.needsRender(), false);
});

test('every invalidation advances the scene revision and reopens demand rendering', () => {
  const schedule = createRenderSchedule();
  schedule.markSubmitted(schedule.state().sceneRevision);
  for (let revision = 2; revision <= 5; revision++) {
    assert.equal(schedule.invalidate(), revision);
    assert.deepEqual(schedule.state(), { sceneRevision: revision, renderedSceneRevision: revision - 1, pendingFrames: 1 });
    assert.equal(schedule.needsRender(), true);
    schedule.markSubmitted(revision);
    assert.equal(schedule.needsRender(), false);
  }
});

test('four requested warmup frames stop after exactly four submissions', () => {
  const schedule = createRenderSchedule();
  schedule.invalidate(4);
  for (let submitted = 0; submitted < 4; submitted++) {
    assert.equal(schedule.needsRender(), true);
    assert.equal(schedule.state().pendingFrames, 4 - submitted);
    schedule.markSubmitted(schedule.state().sceneRevision);
  }
  assert.equal(schedule.state().pendingFrames, 0);
  assert.equal(schedule.needsRender(), false);
});

test('invalidation preserves the larger pending warmup request', () => {
  const schedule = createRenderSchedule();
  schedule.invalidate(4);
  schedule.markSubmitted(schedule.state().sceneRevision);
  schedule.invalidate();
  assert.equal(schedule.state().pendingFrames, 3);
  schedule.invalidate(5);
  assert.equal(schedule.state().pendingFrames, 5);
});

test('an invalidation between the render snapshot and submission stays dirty', () => {
  const schedule = createRenderSchedule();
  const submittedRevision = schedule.state().sceneRevision;
  schedule.invalidate();
  schedule.markSubmitted(submittedRevision);
  assert.deepEqual(schedule.state(), { sceneRevision: 2, renderedSceneRevision: 1, pendingFrames: 0 });
  assert.equal(schedule.needsRender(), true);
  schedule.markSubmitted(schedule.state().sceneRevision);
  assert.deepEqual(schedule.state(), { sceneRevision: 2, renderedSceneRevision: 2, pendingFrames: 0 });
  assert.equal(schedule.needsRender(), false);
});

test('submitted revisions must identify an existing scene without moving rendered state backwards', () => {
  const schedule = createRenderSchedule();
  for (const revision of [undefined, null, NaN, Infinity, '1', 0, -1, 1.5, 2]) {
    assert.throws(() => schedule.markSubmitted(revision), RangeError);
    assert.deepEqual(schedule.state(), { sceneRevision: 1, renderedSceneRevision: 0, pendingFrames: 1 });
  }
  schedule.invalidate();
  schedule.markSubmitted(2);
  assert.throws(() => schedule.markSubmitted(1), RangeError);
  assert.deepEqual(schedule.state(), { sceneRevision: 2, renderedSceneRevision: 2, pendingFrames: 0 });
  schedule.markSubmitted(2);
  assert.equal(schedule.state().pendingFrames, 0);
});

test('render schedule state snapshots cannot mutate its internal state', () => {
  const schedule = createRenderSchedule();
  const snapshot = schedule.state();
  snapshot.sceneRevision = 42;
  snapshot.renderedSceneRevision = 42;
  snapshot.pendingFrames = 0;
  assert.deepEqual(schedule.state(), { sceneRevision: 1, renderedSceneRevision: 0, pendingFrames: 1 });
});

test('warmup requests require a reasonable positive integer without changing state on failure', () => {
  const schedule = createRenderSchedule();
  for (const frames of [0, -1, 1.5, NaN, Infinity, '4', null, 121, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => schedule.invalidate(frames), RangeError);
    assert.deepEqual(schedule.state(), { sceneRevision: 1, renderedSceneRevision: 0, pendingFrames: 1 });
  }
  schedule.invalidate(120);
  assert.equal(schedule.state().pendingFrames, 120);
});

test('capture-stage deadline bounds an unresolved operation and preserves normal results',async()=>{
  assert.equal(await withCaptureDeadline(Promise.resolve(42),'ready',100),42);
  await assert.rejects(withCaptureDeadline(new Promise(()=>{}),'GPU completion',5),{name:'CaptureStageTimeout'});
  const original=new Error('original failure');
  await assert.rejects(withCaptureDeadline(Promise.reject(original),'render',100),error=>error===original);
});

test('capture evidence requires one fresh GPU-completed frame and no state change while paused',()=>{
  const before={ready:true,loadGeneration:2,modelGeneration:2,model:'runtime',capturePaused:true,captureFrameSerial:3,continuousFrameSerial:7,sceneRevision:9,renderedSceneRevision:8,camera:{position:[1,2,3]},glass:true,cabinOnly:false,appearance:{paint:'#fff',lights:false},canvas:{width:100,height:100},bounds:{x:0,y:0,width:100,height:100}};
  const after={...before,captureFrameSerial:4,renderedSceneRevision:9};
  assert.ok(Object.values(captureEvidenceChecks(before,after)).every(Boolean));
  for(const changed of [{captureFrameSerial:3},{continuousFrameSerial:8},{capturePaused:false},{loadGeneration:3},{camera:{position:[2,2,3]}},{bounds:{x:1,y:0,width:100,height:100}},{appearance:{paint:'#000',lights:false}}]) {
    assert.ok(Object.values(captureEvidenceChecks(before,{...after,...changed})).some(value=>!value));
  }
});

test('capture evidence rejects a scene invalidation during capture', () => {
  const before = { sceneRevision: 9 };
  const after = { sceneRevision: 10, renderedSceneRevision: 10 };
  assert.equal(captureEvidenceChecks(before, after).sceneUnchanged, false);
});

test('capture evidence requires the completed frame to match the current scene revision', () => {
  const before = { sceneRevision: 9 };
  assert.equal(captureEvidenceChecks(before, { sceneRevision: 9, renderedSceneRevision: 8 }).currentSceneRendered, false);
  assert.equal(captureEvidenceChecks(before, { sceneRevision: 9, renderedSceneRevision: 9 }).currentSceneRendered, true);
});

test('capture evidence rejects absent or invalid scene revisions', () => {
  for (const sceneRevision of [undefined, null, NaN, Infinity, '9', 0, -1, 1.5]) {
    const checks = captureEvidenceChecks({ sceneRevision }, { sceneRevision, renderedSceneRevision: sceneRevision });
    assert.equal(checks.sceneUnchanged, false);
    assert.equal(checks.currentSceneRendered, false);
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
