import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { inspectEyeClearance, cameraNearRadius } from '../viewer/camera-clearance.js';

test('near-plane clearance uses loaded triangles and nested reflected transforms', () => {
  const root = new Group(), parent = new Group(); root.add(parent); parent.scale.set(-1, 1, 1); parent.position.z = 0.14;
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = 'fixture'; parent.add(mesh);
  const preset = { position: [0, 0, 0], near: 0.015, fov: 72 };
  const [result] = inspectEyeClearance(root, { driver: preset }, 1.3);
  assert.ok(Math.abs(result.minimumTriangleDistanceM - 0.14) < 1e-9);
  assert.equal(result.nearPlaneClearForAllPanDirections, true); assert.equal(result.trianglesChecked, 1);
  assert.ok(cameraNearRadius(preset, 3) > cameraNearRadius(preset, 1));
  parent.position.z = 0.005;
  assert.equal(inspectEyeClearance(root, { driver: preset }, 1.3)[0].nearPlaneClearForAllPanDirections, false);
});
