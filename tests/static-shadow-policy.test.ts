import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Texture,
  WebGLCoordinateSystem,
} from "three";
import type { Camera, WebGLRenderer } from "three";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";
import { createVehicleLoader } from "../src/components/three/createVehicleLoader";
import {
  prepareVehicle,
  stepVehicleAppearance,
} from "../src/components/three/materialAdapter";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";
import {
  createVenue,
  setVenueInspectionCutaway,
} from "../src/components/three/venueGeometry";
import { configureStageLayers } from "../src/components/three/stageLayers";
import { overrideCabinWindows } from "../src/components/three/cabinPreview";
import { models } from "../src/data/models";
import {
  cacheDirectionalShadow,
  invalidateSceneShadows,
} from "../src/components/three/staticShadowPolicy";

// The GLB, decompressor, adapted material roles, venue geometry, light frustum,
// and Three shadow traversal are real. Only texture IO and the GPU boundary
// are replaced: this test starts neither a browser nor a listening socket.
let car: PreparedVehicle;
beforeAll(async () => {
  const manifest = JSON.parse(
    readFileSync("modeldata/manifest.json", "utf8"),
  )[0];
  const bytes = Buffer.concat(
    manifest.chunks.map((part: { path: string }) =>
      readFileSync(`modeldata/${part.path}`),
    ),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    manifest.sha256,
  );
  const loader = createVehicleLoader().register((parser) => {
    (
      parser as unknown as { loadTextureImage: () => Promise<Texture> }
    ).loadTextureImage = () => Promise.resolve(new Texture());
    return { name: "SocketFreeTextureIO" };
  });
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  car = prepareVehicle(
    gltf.scene,
    models[0].asset.materialRoles,
    models[0].asset.disabledEmissive,
  );
});

function setup() {
  const scene = new Scene();
  const main = new PerspectiveCamera();
  main.position.set(4.275, 1.8675, 5.1);
  const contact = new OrthographicCamera(-6, 6, 6, -6, 0, 4.5);
  const texture = new Texture();
  const triple: [Texture, Texture, Texture] = [texture, texture, texture];
  const venue = createVenue("studio", {
    floor: triple,
    wall: triple,
    asphalt: triple,
    rock: triple,
  });
  configureStageLayers(venue.group, main);
  const exterior = new Group();
  exterior.scale.setScalar(car.scale);
  exterior.position.set(...car.position);
  exterior.add(car.scene);
  scene.add(exterior, venue.group);
  const light = new DirectionalLight();
  light.position.set(-9, 9, -4);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -20,
    right: 20,
    top: 20,
    bottom: -20,
    far: 65,
  });
  light.shadow.camera.layers.enable(2);
  scene.add(light, light.target);
  let target: unknown = null;
  let draws: { triangles: number; stage: boolean }[] = [];
  const renderer = {
    coordinateSystem: WebGLCoordinateSystem,
    localClippingEnabled: false,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (next: unknown) => {
      target = next;
    },
    clear() {},
    state: {
      setBlending() {},
      buffers: {
        depth: { getReversed: () => false, setTest() {} },
        color: { setClear() {} },
      },
      setScissorTest() {},
      viewport() {},
    },
    renderBufferDirect(
      _camera: unknown,
      _scene: unknown,
      geometry: Mesh["geometry"],
      _material: unknown,
      object: Mesh,
      group: { start: number; count: number } | null,
    ) {
      const start = Math.max(geometry.drawRange.start, group?.start ?? 0);
      const end = Math.min(
        geometry.index?.count ?? geometry.attributes.position.count,
        geometry.drawRange.start + geometry.drawRange.count,
        group ? group.start + group.count : Infinity,
      );
      draws.push({
        triangles: Math.max(0, end - start) / 3,
        stage: object.layers.mask === 4,
      });
    },
  };
  const map = new WebGLShadowMap(
    renderer as never,
    { update: (object: Mesh) => object.geometry } as never,
    { maxTextureSize: 4096 } as never,
  );
  map.enabled = true;
  map.type = PCFSoftShadowMap;
  const lights = [light];
  const before = vi.fn(),
    after = vi.fn();
  scene.onBeforeRender = before;
  scene.onAfterRender = after;
  const stop = cacheDirectionalShadow(scene, light, () => main);
  function frame(camera: Camera = main, nextTarget: unknown = null) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    target = nextTarget;
    draws = [];
    scene.onBeforeRender(
      renderer as unknown as WebGLRenderer,
      scene,
      camera,
      nextTarget as never,
      undefined as never,
      undefined as never,
    );
    map.render(lights, scene, camera);
    scene.onAfterRender(
      renderer as unknown as WebGLRenderer,
      scene,
      camera,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    return {
      draws: draws.length,
      triangles: draws.reduce((sum, draw) => sum + draw.triangles, 0),
      stage: draws.filter((draw) => draw.stage).length,
    };
  }
  return {
    scene,
    main,
    contact,
    light,
    frame,
    stop,
    venue,
    exterior,
    before,
    after,
    map,
    lights,
  };
}
// Four authored 15-slat doors become four submissions. All caster triangles,
// material/side rules, visibility and other meshes remain unchanged.
const SLAT_DRAW_SAVING = 4 * (15 - 1);
const FULL = {
  draws: 468 - SLAT_DRAW_SAVING,
  triangles: 581763,
  stage: 386 - SLAT_DRAW_SAVING,
};
const EMPTY = { draws: 0, triangles: 0, stage: 0 };

describe("explicit main-camera directional shadow cache", () => {
  it("prevents the contact-camera pass consuming first capture, then caches exactly 412 equivalent draws", () => {
    const h = setup();
    expect(h.frame(h.contact, {})).toEqual(EMPTY);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    expect(h.light.shadow.map?.width).toBe(2048);
    expect(h.map.autoUpdate).toBe(true);
    h.stop();
  });

  it("keeps camera orbit, cabin look, paint and running-light transitions cached", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    for (let i = 0; i < 5; i++) {
      h.main.position.x += 0.2;
      h.main.rotation.y += 0.1;
      h.main.fov += 1;
      h.main.updateProjectionMatrix();
      stepVehicleAppearance(
        car.bindings,
        i % 2 ? "#ffffff" : "#ff0000",
        i % 2 === 0,
        0.016,
        false,
      );
      expect(h.frame()).toEqual(EMPTY);
    }
    h.stop();
  });

  it("refreshes one complete main pass after each explicit geometry, material or light invalidation", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    for (const change of [
      "geometry mount",
      "geometry unmount",
      "glass override",
      "glass restore",
      "light transform",
      "environment switch",
    ]) {
      invalidateSceneShadows(h.scene);
      expect(h.frame(h.contact, {}), change).toEqual(EMPTY);
      expect(h.frame(h.main, {}), change).toEqual(EMPTY);
      expect(h.frame(), change).toEqual(FULL);
      expect(h.frame(), change).toEqual(EMPTY);
    }
    h.stop();
  });

  it("includes newly mounted geometry and removes detached geometry after explicit invalidation", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.castShadow = true;
    mesh.position.y = 1;
    h.scene.add(mesh);
    invalidateSceneShadows(h.scene);
    expect(h.frame()).toEqual({
      ...FULL,
      draws: FULL.draws + 1,
      triangles: 581775,
    });
    expect(h.frame()).toEqual(EMPTY);
    mesh.removeFromParent();
    invalidateSceneShadows(h.scene);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    h.stop();
  });

  it("refreshes real cabin material-side overrides and their restore without redrawing subsequent look frames", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    const restore = overrideCabinWindows(car.scene);
    invalidateSceneShadows(h.scene);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    restore();
    invalidateSceneShadows(h.scene);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    h.stop();
  });

  it("refreshes changed inspection cutaways at 3.8 only, and restores their stage casters", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    function inspection(height: number) {
      if (setVenueInspectionCutaway(h.venue.group, height))
        invalidateSceneShadows(h.scene);
    }
    expect(setVenueInspectionCutaway(h.venue.group, 3.8)).toBe(false);
    inspection(3.8);
    expect(h.frame()).toEqual(EMPTY);
    inspection(3.81);
    expect(h.frame()).toEqual({
      draws: 440 - SLAT_DRAW_SAVING,
      triangles: 580275,
      stage: 358 - SLAT_DRAW_SAVING,
    });
    inspection(10);
    expect(h.frame()).toEqual(EMPTY);
    inspection(3.8);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    h.stop();
  });

  it("restores prior callbacks and light policy after an idempotent cleanup, including StrictMode remount", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    expect(h.before).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledTimes(1);
    h.stop();
    h.stop();
    expect(h.scene.onBeforeRender).toBe(h.before);
    expect(h.scene.onAfterRender).toBe(h.after);
    expect(h.light.shadow.autoUpdate).toBe(true);
    expect(h.frame()).toEqual(FULL);
    const stop = cacheDirectionalShadow(h.scene, h.light, () => h.main);
    expect(h.frame(h.contact, {})).toEqual(EMPTY);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(EMPTY);
    stop();
  });
  it("leaves unregistered dynamic shadow lights updating normally", () => {
    const h = setup();
    expect(h.frame()).toEqual(FULL);
    const dynamic = new DirectionalLight();
    dynamic.position.copy(h.light.position);
    dynamic.shadow = h.light.shadow.clone();
    dynamic.shadow.autoUpdate = true;
    dynamic.castShadow = true;
    h.scene.add(dynamic, dynamic.target);
    h.lights.push(dynamic);
    expect(h.frame()).toEqual(FULL);
    expect(h.frame()).toEqual(FULL);
    invalidateSceneShadows(h.scene);
    expect(h.frame()).toEqual({
      draws: FULL.draws * 2,
      triangles: 1163526,
      stage: FULL.stage * 2,
    });
    expect(h.frame()).toEqual(FULL);
    expect(dynamic.shadow.autoUpdate).toBe(true);
    h.stop();
  });
});
