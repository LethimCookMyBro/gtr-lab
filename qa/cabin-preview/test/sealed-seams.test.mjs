import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { inspectClosureRays, WINDOW_ALLOWLIST } from '../viewer/closure-rays.mjs';

const root = new URL('../../../', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = await readFile(new URL('../seam-fixtures.json', import.meta.url));
const fixtures = JSON.parse(fixtureBytes);
const toThree = ([x, y, z]) => [x, z, -y];

function geometryOnlyGlb(input) {
  const jsonLength=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+jsonLength));
  const offset=20+jsonLength,binary=input.subarray(offset+8,offset+8+input.readUInt32LE(offset));
  // Node geometry/material-role test only. CI must decode all original images in real WebGL.
  json.materials=json.materials.map(material=>({name:material.name,doubleSided:material.doubleSided}));
  delete json.images;delete json.textures;delete json.samplers;
  const serialized=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([serialized,Buffer.alloc((4-serialized.length%4)%4,32)]);
  const output=Buffer.alloc(28+padded.length+binary.length);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);
  output.writeUInt32LE(binary.length,20+padded.length);output.writeUInt32LE(0x004e4942,24+padded.length);binary.copy(output,28+padded.length);
  return output;
}

test('96 pinned seam rays retain both views and exact source-coordinate conversion', () => {
  assert.equal(sha256(fixtureBytes), '90d865bb197369d5c95ff708fb095449927ba19d318a9965ce015f77880bb3f4');
  assert.equal(fixtures.provenance.sourceSha256, 'cfa1abbfd2603869dc2782c961c5cfdb155fdf4ef6ab9e8d917869f186d691c8');
  assert.equal(fixtures.provenance.sourceFailureCount, 7560);
  assert.equal(fixtures.provenance.sourceBytes, 5066154);
  assert.equal(fixtures.coordinateSystem, 'three-y-up-native-metres');
  assert.equal(fixtures.maxDistanceMetres, 5);
  assert.deepEqual(fixtures.windowAllowlist, [...WINDOW_ALLOWLIST]);
  assert.deepEqual(fixtures.expectedCounts, { closures: 96, glazing: 0, informational: 0 });
  assert.equal(fixtures.closureRays.length, 96);
  assert.equal(fixtures.glazingRays.length, 0);
  assert.equal(fixtures.informationalRays.length, 0);
  assert.equal(fixtures.provenance.sourceRecords.length, 96);
  assert.equal(new Set(fixtures.provenance.sourceRecords.map(record => record.failureIndex)).size, 96);
  for (const [index, row] of fixtures.closureRays.entries()) {
    const [captureIndex, x, y, sourceIndex, ...direction] = row;
    const capture = fixtures.captures[captureIndex], original = fixtures.provenance.sourceRecords[index];
    assert.equal(capture.file, original.view);
    assert.deepEqual([x, y], original.pixel);
    assert.equal(fixtures.sources[sourceIndex], original.now);
    assert.deepEqual(capture.origin, toThree(original.eye));
    assert.deepEqual(direction, toThree(original.direction));
    assert.match(original.before, /^C2/);
    assert.ok(original.failureIndex >= 0 && original.failureIndex < 7560);
  }
  for (const [index, file] of ['desktop-driver-left.png', 'desktop-passenger-right.png'].entries()) {
    assert.equal(fixtures.captures[index].file, file);
    const selected = fixtures.closureRays.filter(row => row[0] === index);
    assert.equal(selected.length, 48);
    // Farthest-point sampling covers the image-space seam instead of selecting
    // adjacent pixels from just one small successful repair.
    assert.ok(Math.max(...selected.map(row => row[1])) - Math.min(...selected.map(row => row[1])) > 800);
    assert.ok(Math.max(...selected.map(row => row[2])) - Math.min(...selected.map(row => row[2])) > 250);
  }
});

for (const model of [
  { variant: 'spatial', file: 'r35-original-cabin-lod0.glb.gz', sha256: '111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8', expectedClosed: 0, primitives: 303 },
  { variant: 'sealed', file: 'r35-sealed-spatial.glb.gz', sha256: '3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd', expectedClosed: 96, primitives: 309 },
]) test(`${model.variant}: exact loaded geometry proves the 96 seam regression expectations in both side modes`, async () => {
  const exterior = geometryOnlyGlb(await readFile(new URL('public/models/ciasny-r35.glb', root)));
  const cabin = gunzipSync(await readFile(new URL(`../${model.file}`, import.meta.url)));
  assert.equal(sha256(cabin), model.sha256);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const parse = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const [ext, int] = await Promise.all([parse(exterior), parse(cabin)]);
  const combined = new Group(); combined.add(ext.scene, int.scene);
  const roles = JSON.parse(await readFile(new URL('../roles.json', import.meta.url), 'utf8'));
  for (const sidePolicy of ['double-sided-geometry', 'runtime-with-double-sided-windows']) {
    const result = inspectClosureRays(combined, fixtures, { roles, sidePolicy });
    assert.equal(result.total, 96);
    assert.equal(result.meshCount, model.primitives + 82);
    assert.equal(result.closed, model.expectedClosed, JSON.stringify(result.fixtures.map(({ file, pixel, hit, closed }) => ({ file, pixel, hit, closed }))));
    assert.equal(result.failedFixtures.length, 96 - model.expectedClosed);
    assert.equal(result.passed, model.expectedClosed === 96);
    for (const capture of fixtures.captures) {
      const checks = result.fixtures.filter(row => row.file === capture.file);
      assert.equal(checks.length, 48);
      assert.equal(checks.filter(row => row.closed).length, model.expectedClosed / 2);
    }
    console.log(JSON.stringify({ variant: model.variant, sidePolicy, closed: result.closed, total: result.total, scope: result.scope }));
  }
});
