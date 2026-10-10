import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const bytes = gunzipSync(readFileSync('qa/cabin-preview/r35-cabin-realism.glb.gz'));
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binary = bytes.subarray(28 + jsonLength);

test('the exact textured cabin retains bounded geometry, opaque materials and all embedded maps', () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83');
  expect(bytes.length).toBe(18848516);
  expect(json.nodes.length).toBe(653);
  expect(json.nodes.filter(node => node.mesh !== undefined).length).toBe(284);
  expect(json.materials.length).toBe(46);
  expect(json.images.length).toBe(10);
  expect(json.textures.length).toBe(10);
  let primitives = 0, triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    primitives++;
    expect(primitive.mode ?? 4).toBe(4);
    triangles += json.accessors[primitive.indices].count / 3;
    const attributes = primitive.attributes;
    if (attributes.TEXCOORD_3 !== undefined) for (let index = 0; index <= 3; index++) expect(attributes['TEXCOORD_' + index]).toBeTypeOf('number');
    if (attributes.TEXCOORD_2 !== undefined) for (let index = 0; index <= 2; index++) expect(attributes['TEXCOORD_' + index]).toBeTypeOf('number');
  }
  expect(primitives).toBe(309); expect(triangles).toBe(509692);
  for (const material of json.materials) expect(material.alphaMode ?? 'OPAQUE').toBe('OPAQUE');
  for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined();
  let rgbaWithMips = 0;
  for (const image of json.images) {
    expect(image.uri).toBeUndefined(); expect(image.mimeType).toBe('image/png');
    const view = json.bufferViews[image.bufferView];
    const png = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    expect(width).toBeLessThanOrEqual(2048); expect(height).toBeLessThanOrEqual(1024);
    if (width > 1024) expect(height).toBeLessThanOrEqual(256);
    let mipWidth = width, mipHeight = height;
    for (;;) {
      rgbaWithMips += mipWidth * mipHeight * 4;
      if (mipWidth === 1 && mipHeight === 1) break;
      mipWidth = Math.max(1, Math.floor(mipWidth / 2)); mipHeight = Math.max(1, Math.floor(mipHeight / 2));
    }
  }
  expect(rgbaWithMips).toBe(18524848);
});

test('historical untextured sealed QA input stays byte-exact for before-and-after evidence', () => {
  const baseline = gunzipSync(readFileSync('qa/cabin-preview/r35-sealed-spatial.glb.gz'));
  expect(createHash('sha256').update(baseline).digest('hex')).toBe('3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd');
});

test('the browser observer pins every encoded image identity from the reviewed asset', () => {
  const manifest = JSON.parse(readFileSync('qa/cabin-preview/realism-images.json', 'utf8'));
  expect(manifest.assetSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(manifest.assetBytes).toBe(bytes.length);
  expect(manifest.images).toEqual(json.images.map(image => {
    const view = json.bufferViews[image.bufferView];
    const encoded = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    return { name: image.name, bytes: encoded.length, mimeType: image.mimeType, sha256: createHash('sha256').update(encoded).digest('hex') };
  }));
});
