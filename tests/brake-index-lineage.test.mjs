import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { models } from '../src/data/models';
import { cabinModels } from '../scripts/cabin-integration-policy.mjs';
import { validateManifest, validateGlb } from '../scripts/prepare-models.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync('modeldata/manifest.json', 'utf8'));
const originalHash = 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d';
const candidateHash = 'e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9';
const candidatePath = '/models/ciasny-r35-brake-index-e9425289.glb';
function asset(path) {
  const entry = manifest.find(item => item.path === path);
  expect(entry, 'Exact separately named manifest entry').toBeDefined();
  const bytes = Buffer.concat(entry.chunks.map(chunk => { const b = readFileSync(`modeldata/${chunk.path}`); expect(b.length).toBe(chunk.bytes); expect(sha(b)).toBe(chunk.sha256); return b; }));
  validateGlb(bytes, entry);
  const length = bytes.readUInt32LE(12);
  return { entry, bytes, json: JSON.parse(bytes.subarray(20, 20 + length)), binary: bytes.subarray(28 + length) };
}
test('restored runtime and body proof select the immutable original, leaving derivative lineage historical', () => {
  const runtime = models.find(model => model.id === 'premium').asset;
  expect(runtime.url).toBe('/models/ciasny-r35.glb');
  expect(cabinModels[1]).toEqual({ path: '/models/ciasny-r35.glb', bytes: 8296356, sha256: originalHash });
  expect(runtime.changes.join(' ')).toMatch(/Exterior topology retained|No exterior mesh simplification/);
  expect(runtime.changes.join(' ')).not.toMatch(/index-only.*75.?78/i);
  const derivative = manifest.find(entry => entry.path === candidatePath);
  expect(derivative.changes.join(' ')).toMatch(/index-only.*75.?78/i);
  expect(derivative.changes.join(' ')).toMatch(/tire\/wheel geometry/);
});
test('both exact exterior identities reconstruct from bounded chunks and retain source/license lineage', () => {
  validateManifest(manifest);
  const source = asset('/models/ciasny-r35.glb'), candidate = asset(candidatePath);
  expect(source.entry.sha256).toBe(originalHash); expect(source.bytes.length).toBe(8296356);
  expect(candidate.entry.sha256).toBe(candidateHash); expect(candidate.bytes.length).toBe(8566388);
  expect(candidate.entry.sourceSha256).toBe(originalHash);
  expect(candidate.entry.originalSha256).toBe(source.entry.originalSha256);
  expect(candidate.entry.source).toEqual(source.entry.source); expect(candidate.entry.license).toEqual(source.entry.license);
  expect(candidate.entry.changes.join(' ')).toMatch(/tire\/wheel geometry/);
  expect(candidate.entry.changes.join(' ')).not.toMatch(/\bprivate\b/i);
  for (const path of ['modeldata/ATTRIBUTION.txt', 'public/models/ATTRIBUTION.txt']) {
    const credit = readFileSync(path, 'utf8');
    expect(credit).toContain('Ciasny'); expect(credit).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(credit).toContain(candidateHash); expect(credit).toContain(originalHash);
    expect(credit).toMatch(/tire\/wheel geometry/);
    expect(credit).not.toMatch(/\bprivate\b/i);
  }
});
test('only four primitive index bindings differ, with every source binary byte and all 78 other meshes exact', async () => {
  const a = asset('/models/ciasny-r35.glb'), b = asset(candidatePath);
  expect(a.binary.length).toBe(8143000);
  expect(b.binary.subarray(0, a.binary.length).equals(a.binary)).toBe(true);
  expect(b.json.asset.extras.brakeOptimization).toEqual({ sourceSHA256: originalHash, targetMeshes: [75, 76, 77, 78], indexOnly: true, attributionUnchanged: true });
  expect(b.json.accessors.length).toBe(a.json.accessors.length + 4);
  expect(b.json.bufferViews.length).toBe(a.json.bufferViews.length + 4);
  expect(b.json.accessors.slice(0, a.json.accessors.length)).toEqual(a.json.accessors);
  expect(b.json.bufferViews.slice(0, a.json.bufferViews.length)).toEqual(a.json.bufferViews);
  await MeshoptDecoder.ready;
  const targets = [75, 76, 77, 78];
  const counts = [33147, 30807, 40094, 25760];
  for (const [i, mesh] of a.json.meshes.entries()) {
    const candidate = b.json.meshes[i];
    if (!targets.includes(i)) { expect(candidate).toEqual(mesh); continue; }
    expect(candidate.primitives.length).toBe(1);
    const p = candidate.primitives[0], old = mesh.primitives[0], index = targets.indexOf(i);
    expect({ ...candidate, primitives: [{ ...p, indices: old.indices }] }).toEqual(mesh);
    expect(p.indices).toBe(a.json.accessors.length + index);
    const accessor = b.json.accessors[p.indices], view = b.json.bufferViews[accessor.bufferView];
    const compression = view.extensions.EXT_meshopt_compression;
    expect(compression.buffer).toBe(0); expect(compression.mode).toBe('TRIANGLES');
    expect(compression.byteOffset).toBeGreaterThanOrEqual(a.binary.length);
    expect(compression.byteOffset + compression.byteLength).toBeLessThanOrEqual(b.binary.length);
    expect(accessor.count).toBe(counts[index] * 3);
    const decoded = new Uint8Array(compression.count * compression.byteStride);
    MeshoptDecoder.decodeGltfBuffer(decoded, compression.count, compression.byteStride, b.binary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength), compression.mode, compression.filter);
    const indices = accessor.componentType === 5123 ? new Uint16Array(decoded.buffer) : new Uint32Array(decoded.buffer);
    expect(indices.length).toBe(accessor.count);
    const vertices = a.json.accessors[old.attributes.POSITION].count;
    expect(indices.every(value => value < vertices)).toBe(true);
  }
  const triangles = json => json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0), 0);
  expect(triangles(a.json)).toBe(566475); expect(triangles(b.json)).toBe(406341);
  const normalized = structuredClone(b.json);
  for (const i of targets) normalized.meshes[i].primitives[0].indices = a.json.meshes[i].primitives[0].indices;
  normalized.accessors = normalized.accessors.slice(0, a.json.accessors.length);
  normalized.bufferViews = normalized.bufferViews.slice(0, a.json.bufferViews.length);
  normalized.buffers = a.json.buffers;
  normalized.asset.extras.changes = a.json.asset.extras.changes;
  delete normalized.asset.extras.brakeOptimization;
  expect(normalized).toEqual(a.json);
});


test('restored current material proof and historical diagnostics retain the original geometry', () => {
  const current = readFileSync('scripts/capture-vehicle-materials.mjs', 'utf8');
  expect(current).toContain('/models/ciasny-r35.glb'); expect(current).toContain(originalHash); expect(current).not.toContain(candidateHash);
  for (const file of ['scripts/capture-path-policy.mjs', 'scripts/gpu-frame-policy.mjs', 'scripts/capture-housing-material.mjs', 'qa/cabin-preview/prepare.mjs']) {
    const historical = readFileSync(file, 'utf8');
    expect(historical).toContain(originalHash); expect(historical).not.toContain(candidateHash);
  }
});
