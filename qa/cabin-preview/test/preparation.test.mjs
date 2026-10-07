import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const models = [
  {
    variant: 'spatial', file: 'r35-original-cabin-lod0.glb', bytes: 14187168,
    sha256: '111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8',
    gzip: { file: 'r35-original-cabin-lod0.glb.gz', bytes: 7532332, sha256: '02235501d454c343314d6fd9c0dc838b69989862d818d5a7d3ed4806938e515e' },
    loadedPrimitives: 303,
  },
  {
    variant: 'global', file: 'r35-contained-global-control.glb', bytes: 14216128,
    sha256: 'f1e96e98d36d132d37b7419ea255205b1c9e0e2137ca6891311432a27b60fa9c',
    gzip: { file: 'r35-contained-global-control.glb.gz', bytes: 7459198, sha256: '64fe1bb0fffa9cbbaacb90b972b2968f6716c5a6798ca95f5b46c1f0d50bacff' },
    loadedPrimitives: 162,
  },
];

async function readModel(model) {
  const compressed = await readFile(new URL(`../${model.gzip.file}`, import.meta.url));
  const bytes = gunzipSync(compressed);
  return { compressed, bytes, json: JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12))) };
}

function triangleDefinition(json) {
  const byMaterial = Array(json.materials.length).fill(0);
  let primitives = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, 'Every cabin primitive uses triangles');
    const count = json.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
    assert.equal(count % 3, 0);
    byMaterial[primitive.material] += count / 3;
    primitives++;
  }
  return { byMaterial, triangles: byMaterial.reduce((sum, count) => sum + count, 0), primitives };
}

for (const model of models) test(`${model.variant} compressed cabin and prepared GLB have the exact frozen identity`, async () => {
  const { compressed, bytes } = await readModel(model);
  assert.equal(compressed.length, model.gzip.bytes);
  assert.equal(sha256(compressed), model.gzip.sha256);
  assert.equal(bytes.length, model.bytes);
  assert.equal(sha256(bytes), model.sha256);
  const prepared = await readFile(new URL(`.qa-cabin-runtime/${model.file}`, root));
  assert.equal(prepared.length, model.bytes);
  assert.equal(sha256(prepared), model.sha256);
});

test('controlled pair has identical material definitions and per-material triangle totals', async () => {
  const parsed = await Promise.all(models.map(readModel));
  assert.deepEqual(parsed[0].json.materials, parsed[1].json.materials);
  const definitions = parsed.map(({ json }, index) => {
    assert.equal(json.materials.length, 46);
    assert.equal((json.images || []).length, 0);
    assert.equal((json.textures || []).length, 0);
    const definition = triangleDefinition(json);
    assert.equal(definition.triangles, 487228);
    assert.equal(definition.primitives, models[index].loadedPrimitives);
    return definition;
  });
  assert.deepEqual(definitions[0].byMaterial, definitions[1].byMaterial);
});

test('prepared manifest pins both frozen inputs, common source lineage, exterior and app source checks', async () => {
  const manifest = JSON.parse(await readFile(new URL('.qa-cabin-runtime/input-manifest.json', root), 'utf8'));
  assert.equal(manifest.geometrySourceSha256, 'bf38f51d0386e80b2fbbba9b7acda936aba0f5fbaf0ec183f5a96b646933af7f');
  assert.equal(manifest.finishedSourceSha256, 'f69ea1e852811e0c2ca022c43e689d2e864904d02c7199b999ab66c751335781');
  assert.equal(manifest.sourceBaselineCommit, '276be604e8ff22afbeabecb42d6805187a7068cb');
  assert.equal(manifest.assets.length, 4);
  for (const model of models) {
    const asset = manifest.assets.find(value => value.file === model.file);
    assert.ok(asset, model.file);
    for (const key of ['variant', 'bytes', 'sha256', 'loadedPrimitives']) assert.equal(asset[key], model[key]);
    assert.deepEqual(asset.gzip, model.gzip);
    assert.equal(asset.triangles, 487228);
    assert.equal(asset.materials, 46);
    assert.equal(asset.images, 0);
  }
  const exterior = manifest.assets.find(value => value.file === 'ciasny-r35.glb');
  const exteriorBytes = await readFile(new URL('.qa-cabin-runtime/ciasny-r35.glb', root));
  assert.equal(exterior.bytes, 8296356);
  assert.equal(exterior.sha256, 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d');
  assert.equal(exteriorBytes.length, exterior.bytes);
  assert.equal(sha256(exteriorBytes), exterior.sha256);
  assert.equal(exterior.loadedPrimitives, 82);
  assert.equal(exterior.triangles, 566475);
  assert.deepEqual(manifest.sourceFiles.map(({ file, gitBlobSha }) => ({ file, gitBlobSha })), [
    { file: 'src/components/three/materialAdapter.ts', gitBlobSha: '4677edf8203108556ab02dc5a16e0fb94b894f54' },
    { file: 'src/components/three/sceneHelpers.ts', gitBlobSha: 'fbcc786d7c408be8ce5ee140106b7c5bc0c727dc' },
  ]);
  const appearance = JSON.parse(await readFile(new URL('.qa-cabin-runtime/app-appearance.json', root), 'utf8'));
  assert.equal(appearance.sourceGitBlob, '0f123a553ba0b924cfa6232b36e4faee00b72990');
});

test('baseline evidence retains the original model identity and identical camera contract', async () => {
  const baseline = JSON.parse(await readFile(new URL('../reference-baseline.json', import.meta.url), 'utf8'));
  assert.equal(baseline.commit, '93d4fda63915c64ff1b3a8d852128fba667873f0');
  assert.equal(baseline.cabinSha256, 'c1ae509893528c3b91e77417382fe7edbce10bc02e65243bf1149b80e884c5eb');
  const cameras = await readFile(new URL('../camera-contract.json', import.meta.url));
  assert.equal(sha256(cameras), baseline.cameraContractSha256);
  assert.equal(baseline.plans.desktop.screenshots.length, 33);
  assert.equal(baseline.plans.mobile.screenshots.length, 18);
  for (const plan of Object.values(baseline.plans)) {
    const cabin = plan.screenshots.find(value => value.file.endsWith('-cabin-isolated.png'));
    assert.equal(cabin.rendererCounters.calls, 515);
    assert.equal(cabin.rendererCounters.triangles, 446480);
  }
});

const sealedModel = {
  variant: 'sealed', file: 'r35-sealed-spatial.glb', bytes: 14599520,
  sha256: '3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd',
  gzip: { file: 'r35-sealed-spatial.glb.gz', bytes: 7774439, sha256: '171fb992e42632d75c87739441c71126e89de3223491a16dc6f0dbb93e1449db' },
  loadedPrimitives: 309,
};

test('sealed spatial is an exact fourth input with its separate repaired source lineage', async () => {
  const { compressed, bytes, json } = await readModel(sealedModel);
  assert.equal(compressed.length, sealedModel.gzip.bytes);
  assert.equal(sha256(compressed), sealedModel.gzip.sha256);
  assert.equal(bytes.length, sealedModel.bytes);
  assert.equal(sha256(bytes), sealedModel.sha256);
  const manifest = JSON.parse(await readFile(new URL('.qa-cabin-runtime/input-manifest.json', root), 'utf8'));
  const asset = manifest.assets[3];
  assert.ok(asset, 'Sealed spatial must be an additional fourth asset');
  for (const key of ['variant', 'file', 'bytes', 'sha256', 'loadedPrimitives']) assert.equal(asset[key], sealedModel[key]);
  assert.deepEqual(asset.gzip, sealedModel.gzip);
  assert.equal(asset.geometrySourceSha256, '785cf1c4541df1d83fcc6c6a6a2e837deeb75f489a9b0241c70e07149ab8a070');
  assert.equal(asset.finishedSourceSha256, 'b379c1f2f53f61967aa7bf72ba08927256a44f942a050e406d0b65419e9483ca');
  assert.notEqual(asset.geometrySourceSha256, manifest.geometrySourceSha256);
  assert.notEqual(asset.finishedSourceSha256, manifest.finishedSourceSha256);
  const prepared = await readFile(new URL(`.qa-cabin-runtime/${sealedModel.file}`, root));
  assert.equal(prepared.length, sealedModel.bytes);
  assert.equal(sha256(prepared), sealedModel.sha256);
  assert.equal(asset.triangles, 509692);
  assert.equal(asset.materials, 46);
  assert.equal(asset.images, 0);
  assert.equal(asset.textures, 0);
  assert.deepEqual(json.materials, (await readModel(models[0])).json.materials, 'Sealing retains the calibrated material definitions');
  assert.equal(json.materials.length, 46);
  assert.equal((json.images || []).length, 0);
  assert.equal((json.textures || []).length, 0);
  const definition = triangleDefinition(json);
  assert.equal(definition.triangles, 509692);
  assert.equal(definition.primitives, 309);
  assert.equal(json.nodes.filter(node => Number.isInteger(node.mesh)).length, 284);
  assert.deepEqual(manifest.assets.slice(0, 3).map(value => value.file), [...models.map(model => model.file), 'ciasny-r35.glb']);
});
