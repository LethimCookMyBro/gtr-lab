import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {independentExteriorTransform} from '../scripts/causal-motion-preflight.mjs';
import {assessObservedEffectRun} from '../scripts/causal-observed-effect-policy.mjs';
import {fixture} from './fixtures/causal-run.mjs';

const historical=await readFile('evidence/desktop-original-report.json');
test('Pinned symmetric model derives canonical positive zero before the JSON boundary',async()=>{
  const bytes=await readFile(process.env.R35_MODEL_PATH??'../../gtr-lab/public/models/ciasny-r35.glb');
  const transform=independentExteriorTransform(bytes);
  const rawX=-(transform.nativeBounds.min[0]+transform.nativeBounds.max[0])*transform.scale/2;
  assert.ok(Object.is(rawX,-0),'Regression must exercise the actual negative-zero derivation');
  assert.ok(Object.is(transform.position[0],0));
  assert.deepEqual(transform,JSON.parse(JSON.stringify(transform)));
  assert.equal(transform.scale,1.0000081514774057);
  assert.deepEqual(transform.position,[0,0.00002822209981912982,0.000021544078648632483]);
  assert.deepEqual(transform.nativeBounds,{min:[-1.021994709968567,-0.00002822186976919605,-2.3500023880872787],max:[1.021994709968567,1.371688665207368,2.3499593002812107]});
});
test('Canonical JSON transform passes full synthetic replay without changing strict equality',()=>{
  const f=fixture(historical);
  f.causal.transform=JSON.parse(JSON.stringify(f.config.transform));
  assert.equal(assessObservedEffectRun(f).result,'narrow-cabin-observed-effect-only');
});
const mutations={
  'smallest positive nonzero':t=>t.position[0]=Number.MIN_VALUE,
  'smallest negative nonzero':t=>t.position[0]=-Number.MIN_VALUE,
  'nearby scale':t=>t.scale+=Number.EPSILON,
  'numeric string':t=>t.position[0]='0',
  null:t=>t.position[0]=null,
  undefined:t=>t.position[0]=undefined,
  NaN:t=>t.position[0]=NaN,
  Infinity:t=>t.position[0]=Infinity,
  'negative Infinity':t=>t.position[0]=-Infinity,
  false:t=>t.position[0]=false,
  'array hole':t=>delete t.position[0],
  'short tuple':t=>t.position.pop(),
  'extra tuple member':t=>t.position.push(0),
  'missing key':t=>delete t.scale,
  'extra key':t=>t.extra=undefined,
  'negative zero injected after boundary':t=>t.position[0]=-0,
};
for(const[name,mutate]of Object.entries(mutations))test(`Strict raw transform evidence still rejects ${name}`,()=>{
  const f=fixture(historical);f.causal.transform=structuredClone(f.config.transform);mutate(f.causal.transform);
  const result=assessObservedEffectRun(f);
  assert.equal(result.result,'insufficient');
  assert.ok(result.failures.includes('Raw model transform differs from independently derived source model'));
});
test('Raw transform array order and nested bounds remain exact',()=>{
  const f=fixture(historical);
  f.config.transform.nativeBounds={min:[1,2,3],max:[4,5,6]};
  f.causal.transform=structuredClone(f.config.transform);
  f.causal.transform.nativeBounds.min.reverse();
  assert.ok(assessObservedEffectRun(f).failures.includes('Raw model transform differs from independently derived source model'));
});
test('Object key order remains semantic while missing versus undefined stays distinct',()=>{
  const f=fixture(historical),t=f.config.transform;
  f.causal.transform={position:[...t.position],scale:t.scale};
  assert.equal(assessObservedEffectRun(f).result,'narrow-cabin-observed-effect-only');
  f.causal.transform.absent=undefined;
  assert.equal(assessObservedEffectRun(f).result,'insufficient');
});
