import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';

const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../..');
const output = join(root, '.qa-cabin-runtime');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const cabinModels = [
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
// Frozen lineage from gtr-cabin-spatial-batching-20261007/FINAL_HANDOFF.json.
const geometrySourceSha256 = 'bf38f51d0386e80b2fbbba9b7acda936aba0f5fbaf0ec183f5a96b646933af7f';
const finishedSourceSha256 = 'f69ea1e852811e0c2ca022c43e689d2e864904d02c7199b999ab66c751335781';
const expectedExterior = 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d';
await mkdir(output, { recursive: true });
const validatedModels = [];
for (const model of cabinModels) {
  const compressed = await readFile(join(directory, model.gzip.file));
  assert.equal(compressed.length, model.gzip.bytes, `${model.variant} gzip byte length`);
  assert.equal(sha256(compressed), model.gzip.sha256, `${model.variant} gzip SHA-256`);
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.length, model.bytes, `${model.variant} GLB byte length`);
  assert.equal(sha256(bytes), model.sha256, `${model.variant} GLB SHA-256`);
  validatedModels.push({ model, bytes });
}
const exterior = await readFile(join(root, 'public/models/ciasny-r35.glb'));
assert.equal(exterior.length, 8296356);
assert.equal(sha256(exterior), expectedExterior);
for (const { model, bytes } of validatedModels) await writeFile(join(output, model.file), bytes);
await writeFile(join(output, 'ciasny-r35.glb'), exterior);
await cp(join(directory, 'viewer'), join(output, 'viewer'), { recursive: true });
for (const name of ['roles.json', 'camera-contract.json', 'PROVENANCE.md']) await cp(join(directory, name), join(output, name));

const vendor = join(output, 'viewer/vendor'); await mkdir(vendor, { recursive: true });
const threeRoot = join(root, 'node_modules/three');
assert.equal(JSON.parse(await readFile(join(threeRoot, 'package.json'), 'utf8')).version, '0.180.0');
for (const name of ['three.core.js', 'three.module.js']) await cp(join(threeRoot, 'build', name), join(vendor, name));
await cp(join(threeRoot, 'examples/jsm'), join(vendor, 'addons'), { recursive: true });
await cp(join(threeRoot, 'LICENSE'), join(vendor, 'THREE-LICENSE'));

const sourceFiles = { 'materialAdapter.ts': '4677edf8203108556ab02dc5a16e0fb94b894f54', 'sceneHelpers.ts': 'fbcc786d7c408be8ce5ee140106b7c5bc0c727dc' };
const sourceManifest = [], sourceOut = join(output, 'viewer/app-source'); await mkdir(sourceOut, { recursive: true });
for (const [name, expected] of Object.entries(sourceFiles)) {
  const source = await readFile(join(root, 'src/components/three', name)), gitSha = gitHash(source);
  assert.equal(gitSha, expected, `Review source changed: ${name}`);
  const emitted = ts.transpileModule(source.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(join(sourceOut, name.replace(/\.ts$/, '.js')), emitted.replaceAll('"./sceneHelpers"', '"./sceneHelpers.js"'));
  sourceManifest.push({ file: `src/components/three/${name}`, gitBlobSha: gitSha, sha256: sha256(source) });
}
const modelsSource = await readFile(join(root, 'src/data/models.ts')), modelsGitSha = gitHash(modelsSource);
assert.equal(modelsGitSha, '0f123a553ba0b924cfa6232b36e4faee00b72990');
const parsed = ts.createSourceFile('models.ts', modelsSource.toString(), ts.ScriptTarget.Latest, true);
let definition;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'licensedR35') definition = node.initializer;
  ts.forEachChild(node, visit);
}
visit(parsed); assert.ok(definition && ts.isObjectLiteralExpression(definition));
const emitted = ts.transpileModule(`export default ${definition.getText(parsed)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { default: asset } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`);
await writeFile(join(output, 'app-appearance.json'), JSON.stringify({ materialRoles: asset.materialRoles, disabledEmissive: asset.disabledEmissive, sourceGitBlob: modelsGitSha }, null, 2));
const manifest = {
  sourceBaselineCommit: '276be604e8ff22afbeabecb42d6805187a7068cb', qaCommit: process.env.GITHUB_SHA || null, sourceFiles: sourceManifest,
  geometrySourceSha256, finishedSourceSha256,
  assets: [
    ...cabinModels.map(model => ({ ...model, triangles: 487228, materials: 46, images: 0, textures: 0,
      origin: `Frozen contained ${model.variant} batches from the identical finished cabin source; separate inspection candidate` })),
    { file: 'ciasny-r35.glb', bytes: exterior.length, sha256: expectedExterior, loadedPrimitives: 82, triangles: 566475, origin: 'Existing accepted Ciasny exterior reused unchanged from repository modeldata' },
  ], scope: 'Separate preview only. No production UI integration, deployment or physical Android performance claim.',
};
await writeFile(join(output, 'input-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: '.qa-cabin-runtime', manifest }, null, 2));
