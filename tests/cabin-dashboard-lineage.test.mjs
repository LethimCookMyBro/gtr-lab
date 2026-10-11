import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function readAsset(path, bytes, hash) {
  const glb = gunzipSync(readFileSync(path));
  expect(glb.length).toBe(bytes);
  expect(sha256(glb)).toBe(hash);
  expect(glb.subarray(0, 4).toString()).toBe('glTF');
  expect(glb.readUInt32LE(4)).toBe(2);
  expect(glb.readUInt32LE(8)).toBe(glb.length);
  const length = glb.readUInt32LE(12);
  expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);
  expect(glb.readUInt32LE(24 + length)).toBe(0x004e4942);
  return { json: JSON.parse(glb.subarray(20, 20 + length)), binary: glb.subarray(28 + length) };
}
const baseline = readAsset('qa/cabin-preview/r35-cabin-realism.glb.gz', 18848516, '0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83');
const candidate = readAsset('qa/cabin-preview/r35-cabin-dashboard.glb.gz', 19170816, '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326');
const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function accessor(asset, index) {
  const definition = asset.json.accessors[index];
  expect(definition.sparse).toBeUndefined();
  const view = asset.json.bufferViews[definition.bufferView];
  expect(view.buffer).toBe(0);
  const width = dimensions[definition.type] * componentBytes[definition.componentType];
  expect(Number.isFinite(width)).toBe(true);
  const stride = view.byteStride ?? width;
  const offset = definition.byteOffset ?? 0;
  expect(offset + (definition.count - 1) * stride + width).toBeLessThanOrEqual(view.byteLength);
  const start = (view.byteOffset ?? 0) + offset;
  const bytes = Buffer.alloc(definition.count * width);
  for (let index = 0; index < definition.count; index++) asset.binary.copy(bytes, index * width, start + index * stride, start + index * stride + width);
  return { bytes, definition };
}
function geometryEqual(a, b) {
  if (JSON.stringify(Object.keys(a.attributes).sort()) !== JSON.stringify(Object.keys(b.attributes).sort())) return false;
  for (const key of Object.keys(a.attributes)) if (!accessor(baseline, a.attributes[key]).bytes.equals(accessor(candidate, b.attributes[key]).bytes)) return false;
  return accessor(baseline, a.indices).bytes.equals(accessor(candidate, b.indices).bytes);
}

test('the exact five dashboard primitives change while the other 304 remain byte-identical', () => {
  expect(candidate.json.meshes.length).toBe(284);
  expect(baseline.json.meshes.length).toBe(284);
  expect(candidate.json.meshes[25].name).toBe('dashboard solid 0000.002');
  const changed = [];
  let unchanged = 0;
  for (const [meshIndex, mesh] of baseline.json.meshes.entries()) {
    const after = candidate.json.meshes[meshIndex];
    const { primitives, ...metadata } = mesh;
    const { primitives: next, ...nextMetadata } = after;
    expect(nextMetadata).toEqual(metadata);
    expect(next.length).toBe(primitives.length);
    for (const [primitiveIndex, primitive] of primitives.entries()) {
      const output = next[primitiveIndex];
      const { attributes, indices, ...beforeMetadata } = primitive;
      const { attributes: ignoredAttributes, indices: ignoredIndices, ...afterMetadata } = output;
      expect(afterMetadata).toEqual(beforeMetadata);
      if (geometryEqual(primitive, output)) unchanged++;
      else changed.push({ mesh: meshIndex, primitive: primitiveIndex, material: primitive.material, triangles: candidate.json.accessors[output.indices].count / 3 });
    }
  }
  expect(unchanged).toBe(304);
  expect(changed).toEqual([
    { mesh: 25, primitive: 1, material: 13, triangles: 11470 },
    { mesh: 25, primitive: 3, material: 15, triangles: 16668 },
    { mesh: 25, primitive: 5, material: 17, triangles: 5686 },
    { mesh: 25, primitive: 7, material: 19, triangles: 8720 },
    { mesh: 25, primitive: 9, material: 21, triangles: 1724 },
  ]);
});

test('all transforms, hierarchy, pivots and existing node metadata survive the geometry increment', () => {
  expect(candidate.json.nodes.length).toBe(653);
  expect(baseline.json.nodes.length).toBe(653);
  for (const [index, before] of baseline.json.nodes.entries()) {
    const after = structuredClone(candidate.json.nodes[index]);
    if (index === 40) {
      expect(after.extras.geometry_refinement).toBe('Original rounded vent carrier, recessed two-vane ducts and continuous raised fascia lip; visually inferred, not factory CAD');
      delete after.extras.geometry_refinement;
    }
    expect(after).toEqual(before);
  }
  for (const key of ['scene', 'scenes', 'cameras', 'extensions', 'extensionsUsed', 'extensionsRequired']) expect(candidate.json[key]).toEqual(baseline.json[key]);
});

test('materials and all ten encoded image identities remain the exact material baseline', () => {
  expect(candidate.json.materials).toEqual(baseline.json.materials);
  expect(candidate.json.textures).toEqual(baseline.json.textures);
  expect(candidate.json.samplers).toEqual(baseline.json.samplers);
  expect(candidate.json.images.length).toBe(10);
  for (const [index, image] of baseline.json.images.entries()) {
    const { bufferView, ...metadata } = image;
    const { bufferView: nextView, ...nextMetadata } = candidate.json.images[index];
    expect(nextMetadata).toEqual(metadata);
    const encoded = (asset, index) => { const view = asset.json.bufferViews[index]; return asset.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength); };
    expect(encoded(candidate, nextView).equals(encoded(baseline, bufferView))).toBe(true);
  }
});

test('every geometry attribute stays finite, every index is valid and resource counts stay exact', () => {
  const vertexAccessors = new Set();
  const indexAccessors = new Set();
  let triangles = 0;
  for (const mesh of candidate.json.meshes) for (const primitive of mesh.primitives) {
    const count = candidate.json.accessors[primitive.attributes.POSITION].count;
    for (const id of Object.values(primitive.attributes)) {
      vertexAccessors.add(id);
      const { bytes, definition } = accessor(candidate, id);
      expect(definition.count).toBe(count);
      if (definition.componentType === 5126) for (let offset = 0; offset < bytes.length; offset += 4) if (!Number.isFinite(bytes.readFloatLE(offset))) throw new Error(`Nonfinite accessor ${id} at ${offset}`);
    }
    indexAccessors.add(primitive.indices);
    const { bytes, definition } = accessor(candidate, primitive.indices);
    const readers = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE' };
    expect(readers[definition.componentType]).toBeTypeOf('string');
    for (let offset = 0; offset < bytes.length; offset += componentBytes[definition.componentType]) if (bytes[readers[definition.componentType]](offset) >= count) throw new Error(`Out-of-range index ${primitive.indices} at ${offset}`);
    expect(definition.count % 3).toBe(0);
    triangles += definition.count / 3;
  }
  const byteSize = ids => [...ids].reduce((total, id) => total + accessor(candidate, id).bytes.length, 0);
  expect(byteSize(vertexAccessors)).toBe(14231192);
  expect(byteSize(indexAccessors)).toBe(3192132);
  expect(triangles).toBe(508950);
});
