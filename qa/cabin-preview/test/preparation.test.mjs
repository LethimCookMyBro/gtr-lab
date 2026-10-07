import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

test('compressed original cabin expands byte-exactly to the frozen combined closure/material/batching candidate', async () => {
  const compressed = await readFile(new URL('../r35-original-cabin-lod0.glb.gz', import.meta.url)), bytes = gunzipSync(compressed);
  assert.equal(bytes.length, 14216316);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c7d87646650c0cc6e825248052e02301c9fb8b03bb950f531d930238932a2ff1');
  assert.equal(createHash('sha256').update(compressed).digest('hex'), '2d7bb7111b0f8596fb9c91ecba8918649f1043ecc0a6ffca141c9d323c3b492b');
});


test('baseline evidence retains the original model identity and identical camera contract', async () => {
  const baseline=JSON.parse(await readFile(new URL('../reference-baseline.json',import.meta.url),'utf8'));
  assert.equal(baseline.commit,'93d4fda63915c64ff1b3a8d852128fba667873f0');
  assert.equal(baseline.cabinSha256,'c1ae509893528c3b91e77417382fe7edbce10bc02e65243bf1149b80e884c5eb');
  const cameras=await readFile(new URL('../camera-contract.json',import.meta.url));
  assert.equal(createHash('sha256').update(cameras).digest('hex'),baseline.cameraContractSha256);
  assert.equal(baseline.plans.desktop.screenshots.length,33);
  assert.equal(baseline.plans.mobile.screenshots.length,18);
  for(const plan of Object.values(baseline.plans)) {
    const cabin=plan.screenshots.find(value=>value.file.endsWith('-cabin-isolated.png'));
    assert.equal(cabin.rendererCounters.calls,515);
    assert.equal(cabin.rendererCounters.triangles,446480);
  }
});
