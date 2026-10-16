/** CPU geometry only. No browser, WebGL, server, socket, texture decode, or render. */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Box3, PerspectiveCamera, Raycaster, Texture, Triangle, Vector3 } from "three";
import { createVehicleLoader } from "../src/components/three/createVehicleLoader.ts";

const root = new URL("../", import.meta.url);
const anchors = JSON.parse(readFileSync(new URL("src/data/r35-study-camera-anchors.json", root)));
const baseline = { position: [-1.79, 0.8, -0.28], target: [-2.08, 0.48, 1.22], fov: 78 };
const revised = { position: [-1.85, 0.74, -0.28], target: [-2.08, 0.3, 1.22], fov: 72 };
const meshes = [], triangles = [];
const raycaster = new Raycaster();
let scene;
before(async () => {
  const bytes = readFileSync(new URL("public/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb", root));
  assert.equal(bytes.length, 25_813_544);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "a8f6e3e15ab71075f8caf817d362d31be8b7f0f4734f12602ea6348599727585");
  assert.equal(anchors.candidateSha256, "a8f6e3e15ab71075f8caf817d362d31be8b7f0f4734f12602ea6348599727585");
  const loader = createVehicleLoader();
  // Keep every authored material flag; a texture object suffices for geometry queries.
  loader.register(() => ({ name: "CPU_REAR_ANCHOR_GEOMETRY", loadTexture: () => Promise.resolve(new Texture()) }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("CPU rear-anchor test must not fetch"); };
  let parsed;
  try {
    parsed = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  } finally { globalThis.fetch = originalFetch; }
  scene = parsed.scene;
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const id = parsed.parser.associations.get(object)?.meshes;
    assert.equal(typeof id, "number");
    meshes.push({ object, id });
    const position = object.geometry.attributes.position, index = object.geometry.index;
    for (let offset = 0; offset < (index?.count ?? position.count); offset += 3) {
      const vertices = [0, 1, 2].map((k) => new Vector3()
        .fromBufferAttribute(position, index ? index.getX(offset + k) : offset + k)
        .applyMatrix4(object.matrixWorld));
      triangles.push({ id, triangle: new Triangle(...vertices) });
    }
  });
});
function nearest(position) {
  const point = new Vector3(), eye = new Vector3(...position);
  let result = { distance: Infinity, id: null };
  for (const { id, triangle } of triangles) {
    triangle.closestPointToPoint(eye, point);
    const distance = eye.distanceTo(point);
    if (distance < result.distance) result = { distance, id };
  }
  return result;
}
function firstHit(origin, direction) {
  raycaster.set(origin, direction);
  const hit = raycaster.intersectObjects(meshes.map(({ object }) => object), false)[0];
  return hit && { id: meshes.find(({ object }) => object === hit.object).id, distance: hit.distance, point: hit.point.toArray() };
}
function camera(pose, aspect = 390 / 392) {
  const result = new PerspectiveCamera(pose.fov, aspect, 0.015, 50);
  result.position.fromArray(pose.position);
  result.lookAt(new Vector3(...pose.target));
  result.updateMatrixWorld();
  return result;
}
function atNdc(pose, x, y) {
  const view = camera(pose);
  raycaster.setFromCamera({ x, y }, view);
  return firstHit(raycaster.ray.origin, raycaster.ray.direction);
}
function visibleDisplaySamples(pose) {
  const bounds = new Box3().setFromObject(meshes.find(({ id }) => id === 3).object);
  const eye = new Vector3(...pose.position), samples = [];
  // Nine interior points in the source display AABB. This is an occlusion probe,
  // not a pixel visibility estimate; the upper-left point hits authored trim.
  for (const x of [bounds.min.x + 0.005, (bounds.min.x + bounds.max.x) / 2, bounds.max.x - 0.005]) {
    for (const y of [bounds.min.y + 0.005, (bounds.min.y + bounds.max.y) / 2, bounds.max.y - 0.005]) {
      const point = new Vector3(x, y, (bounds.min.z + bounds.max.z) / 2);
      samples.push(firstHit(eye, point.sub(eye).normalize())?.id);
    }
  }
  return samples.filter((id) => id === 3).length;
}
test("changes only the rear inspection pose and retains factory-accuracy limits", () => {
  assert.deepEqual(anchors.sourceViews.rear, revised);
  assert.deepEqual(anchors.sourceViews.driver, { position: [-1.79, 0.8, 0.55], target: [-2, 0.4, 1.38], fov: 72 });
  assert.deepEqual(anchors.sourceViews.passenger, { position: [-2.49, 0.8, 0.55], target: [-2.25, 0.4, 1.38], fov: 72 });
  assert.match(anchors.qualification, /not factory seat measurements or a collision-safe camera volume/);
  assert.match(anchors.qualification, /revised rear pose has not been rendered/);
});
test("decodes the exact unchanged mesh and uses its full source-world transforms", () => {
  assert.equal(meshes.length, 126);
  assert.equal(triangles.length, 756_972);
  const bounds = new Box3().setFromObject(scene);
  const expected = [-3.113844448380405, -0.3240216365958777, -1.3959351978200638, -1.1702390820209985, 1.020536914375311, 3.1205105937259234];
  [...bounds.min.toArray(), ...bounds.max.toArray()].forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9));
});
test("increases eye clearance while leaving the near-plane rectangle clear at fixed pose", () => {
  const old = nearest(baseline.position), current = nearest(revised.position);
  assert.equal(old.id, 116);
  assert.equal(current.id, 14);
  assert.ok(Math.abs(old.distance - 0.05304013851241727) < 1e-8);
  assert.ok(Math.abs(current.distance - 0.07669185318313024) < 1e-8);
  assert.ok(current.distance > old.distance + 0.02);
  // A near-plane corner is the farthest point on that rectangle from the eye.
  // Clearance of the eye-centered sphere therefore clears the entire rectangle.
  // The 3:1 case is a geometric framing stress check, not device/render proof.
  for (const aspect of [390 / 392, 1440 / 900, 3]) {
    const halfHeight = 0.015 * Math.tan(revised.fov * Math.PI / 360);
    const radius = Math.hypot(0.015, halfHeight, halfHeight * aspect);
    assert.ok(radius + 0.035 < current.distance);
  }
  const overhead = firstHit(new Vector3(...revised.position), new Vector3(0, 1, 0));
  assert.equal(overhead.id, 116);
  assert.ok(Math.abs(overhead.distance - 0.12128266443556601) < 1e-8);
});
test("moves nearby upper framing away from rear glass without hiding authored roof", () => {
  const old = atNdc(baseline, 0, 1), current = atNdc(revised, 0, 1);
  assert.equal(old.id, 116);
  assert.equal(current.id, 40);
  assert.ok(Math.abs(old.distance - 0.23310156355515882) < 1e-8);
  assert.ok(Math.abs(current.distance - 0.6819421738720235) < 1e-8);
  // Sparse top-edge probes, not a software renderer or visual acceptance.
  for (const x of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
    const hit = atNdc(revised, x, 1);
    assert.notEqual(hit.id, 116);
    assert.ok(hit.distance > 0.62);
  }
  // Source headliner still occupies the top center. Fresh CI must inspect it.
  assert.equal(atNdc(revised, 0, 0.8).id, 40);
  assert.equal(atNdc(revised, 0, 0.6).id, 119);
});
test("preserves the display sightline after the small inward eye shift", () => {
  assert.equal(visibleDisplaySamples(baseline), 5);
  assert.equal(visibleDisplaySamples(revised), 6);
  assert.equal(atNdc(revised, 0, 0.2).id, 3);
});
