/** CPU-only integration contract for the established shared same-session body recorder. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as policy from '../../scripts/current-render-cost-policy.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

test('fine cabin uses the unchanged shared recorder and exact compressed model identity', async () => {
  const source = await readFile(new URL('../../scripts/current-render-cost-runner.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("importApp('scripts/cabin-leather-model-body.mjs')"), 'Reuse the established source-bound recorder');
  assert.ok(source.includes('captureActualComparisonCabinResponse({cdp,model:nativeCabinModel,baseUrl:base,phase:()=>activeStep})'));
  assert.ok(source.includes('nativeModel.bindRequest({requestId,generation:1,url:request.url(),method:request.method()})'));
  assert.ok(source.includes('nativeModel.readBody({requestId:requestIds.get(response.request()),generation:1,url:response.url(),status:response.status()})'));
  assert.equal(source.includes("cdp.send('Network.enable'"), false, 'Only the shared recorder owns same-session enablement');
  assert.equal(source.includes("cdp.send('Network.getResponseBody'"), false, 'Do not create a second native body path');
  assert.ok(source.includes('assertComparisonModelReceipt(report.nativeModelReceipt,nativeCabinModel,report.bodyLedger.requests)'));
  assert.deepEqual(policy.nativeCabinModel, { ...policy.modelPins[1], gzipBytes:10194113, gzipSha256:'b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5' });
  const app=resolve(process.env.R35_TEST_APP_ROOT??'.');
  for(const [name,pin]of Object.entries({'cabin-leather-model-body.mjs':'36d645367ff8706aa6d721ff397b0d34a7ace32e704f6f89ac75f2fe4cfdc66c','cabin-preparation-network.mjs':'110ae32fe3008b7604fcb06cf5c2d8f1319596d9d6d9ba351170cd2543458d7e'})){
    const actual=hash(await readFile(resolve(app,'scripts',name)));assert.equal(policy.helperPins['scripts/'+name],actual);
    assert.equal(actual,pin);
  }
});
