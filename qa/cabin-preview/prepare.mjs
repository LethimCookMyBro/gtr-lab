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
const expectedCabin = 'c7d87646650c0cc6e825248052e02301c9fb8b03bb950f531d930238932a2ff1';
const expectedExterior = 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d';
await mkdir(output, { recursive: true });
const bytes = gunzipSync(await readFile(join(directory, 'r35-original-cabin-lod0.glb.gz')));
assert.equal(bytes.length, 14216316); assert.equal(sha256(bytes), expectedCabin);
const exterior = await readFile(join(root, 'public/models/ciasny-r35.glb'));
assert.equal(sha256(exterior), expectedExterior);
await writeFile(join(output, 'r35-original-cabin-lod0.glb'), bytes);
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
  assets: [
    { file: 'r35-original-cabin-lod0.glb', bytes: bytes.length, sha256: expectedCabin, origin: 'Authored cabin with repaired closures, material retune, static batches and attributed Ciasny steering-badge geometry; separate inspection candidate' },
    { file: 'ciasny-r35.glb', bytes: exterior.length, sha256: expectedExterior, origin: 'Existing accepted Ciasny exterior reused unchanged from repository modeldata' },
  ], scope: 'Separate preview only. No production UI integration, deployment or physical Android performance claim.',
};
await writeFile(join(output, 'input-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: '.qa-cabin-runtime', manifest }, null, 2));
