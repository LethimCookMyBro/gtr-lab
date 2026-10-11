// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { act, advance, createRoot, extend, _roots } from "@react-three/fiber";
import { RecoverableEnvironment } from "../src/components/three/RecoverableEnvironment";
import type {
  WebGLRenderer,
  WebGLRenderTarget,
  Scene,
  Vector2,
  Camera,
  Mesh,
  DirectionalLight,
} from "three";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";
import {
  BoxGeometry,
  Group as RockGroup,
  Mesh as RockMesh,
  MeshStandardMaterial,
} from "three";

// Node loads R3F's CJS renderer; give its catalogue the same Three constructors.
// The scene, environment capture and contact-shadow components are real. Only
// texture IO and the WebGL device are substituted; no browser or server runs.
const THREE: typeof import("three") = createRequire(import.meta.url)("three");
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  Color: THREE.Color,
  Fog: THREE.Fog,
  AmbientLight: THREE.AmbientLight,
  HemisphereLight: THREE.HemisphereLight,
  DirectionalLight: THREE.DirectionalLight,
  RectAreaLight: THREE.RectAreaLight,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  PlaneGeometry: THREE.PlaneGeometry,
  RingGeometry: THREE.RingGeometry,
  CircleGeometry: THREE.CircleGeometry,
  OrthographicCamera: THREE.OrthographicCamera,
  CubeCamera: THREE.CubeCamera,
});
const inputs = vi.hoisted(() => ({
  textures: [] as import("three").Texture[],
  rockSource: null as import("three").Group | null,
  rockReady: true,
  rockPromise: Promise.resolve(),
}));
vi.mock("@react-three/drei/core/Texture", () => ({
  useTexture: () => inputs.textures,
}));
vi.mock("@react-three/drei/core/useEnvironment", () => ({
  useEnvironment: () => inputs.textures[0],
}));
vi.mock("@react-three/drei/core/Gltf", () => ({
  useGLTF: () => {
    if (!inputs.rockReady) throw inputs.rockPromise;
    return { scene: inputs.rockSource };
  },
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  inputs.textures.forEach((texture) => texture.dispose());
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  inputs.textures = Array.from(
    { length: 13 },
    () => new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1),
  );
  const canvas = document.createElement("canvas");
  const draws: { reflection: boolean; shadow: boolean }[] = [];
  let directionalDraws = 0;
  let roadsideShadowDraws = 0;
  let target: WebGLRenderTarget | null = null;
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    autoClear: true,
    shadowMap: {
      enabled: false,
      type: THREE.PCFSoftShadowMap as import("three").ShadowMapType,
    },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setPixelRatio() {},
    getPixelRatio: () => 1,
    setSize() {},
    getSize: (size: Vector2) => size.set(390, 392),
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
    },
    localClippingEnabled: false,
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
      _geometry: unknown,
      _material: unknown,
      object: Mesh,
    ) {
      directionalDraws++;
      if (object.name === "deferred-shadow-rock") roadsideShadowDraws++;
    },
    render(scene: Scene, camera: Camera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      const device = renderer as unknown as WebGLRenderer;
      if (scene.isScene)
        scene.onBeforeRender(
          device,
          scene,
          camera,
          target as never,
          undefined as never,
          undefined as never,
        );
      const lights: DirectionalLight[] = [];
      scene.traverse((object) => {
        if (
          (object as DirectionalLight).isDirectionalLight &&
          object.castShadow
        )
          lights.push(object as DirectionalLight);
      });
      shadows.render(lights, scene, camera);
      draws.push({
        reflection:
          target !== null &&
          "isWebGLCubeRenderTarget" in target &&
          target.isWebGLCubeRenderTarget === true,
        shadow: Boolean(scene.overrideMaterial),
      });
      if (scene.isScene)
        scene.onAfterRender(
          device,
          scene,
          camera,
          undefined as never,
          undefined as never,
          undefined as never,
        );
    },
    renderLists: { dispose() {} },
    forceContextLoss() {},
  };
  const shadows = new WebGLShadowMap(
    renderer as never,
    { update: (object: Mesh) => object.geometry } as never,
    { maxTextureSize: 4096 } as never,
  );
  renderer.shadowMap = shadows;
  const root = createRoot(canvas);
  roots.push(root);
  // A deliberately non-drawing device implements only methods these real
  // rendering paths use. Three/R3F still execute their full capture lifecycles.
  await root.configure({
    gl: renderer as unknown as WebGLRenderer,
    frameloop: "never",
    shadows: true,
    size: { width: 390, height: 392, top: 0, left: 0 },
    camera: { position: [5, 3, 5] },
  });
  const store = _roots.get(canvas)!.store;
  const frame = () => act(async () => advance(1, false, store.getState()));
  const counts = () => ({
    reflection: draws.filter((draw) => draw.reflection).length,
    shadow: draws.filter((draw) => draw.shadow).length,
    directional: directionalDraws,
  });
  return {
    root,
    store,
    frame,
    counts,
    roadsideCount: () => roadsideShadowDraws,
  };
}

// Exact equivalent grouping: each of the studio's four doors changes 15→1
// submissions. Gallery/night and every reflection/contact capture stay unchanged.
const STUDIO_SHADOW_DRAWS = 386 - 4 * (15 - 1);

it("does not recapture lighting or restart contact shadows for unchanged environment inputs", async () => {
  const { root, frame, counts } = await setup();
  const ready = vi.fn();
  const fallback = vi.fn();
  const renderLighting = () =>
    act(async () =>
      root.render(
        <RecoverableEnvironment
          environment="studio"
          reducedMotion
          onReady={ready}
          onFallback={fallback}
        />,
      ),
    );
  await renderLighting();
  await frame();
  await frame();
  expect(counts()).toEqual({
    reflection: 6,
    shadow: 1,
    directional: STUDIO_SHADOW_DRAWS,
  });
  expect(ready).toHaveBeenCalledTimes(1);
  // Panel, paint, camera, download progress and cabin seat updates all pass
  // these same environment inputs while their own scene components update.
  for (let update = 0; update < 5; update++) {
    await renderLighting();
    await frame();
    expect(counts()).toEqual({
      reflection: 6,
      shadow: 1,
      directional: STUDIO_SHADOW_DRAWS,
    });
  }
  expect(fallback).not.toHaveBeenCalled();
});

it("captures each new environment and light, but only refreshes depth at actual inspection transitions", async () => {
  const { root, store, frame, counts } = await setup();
  const ready = vi.fn();
  const renderLighting = (
    environment: "studio" | "night" | "gallery",
    request = 0,
  ) =>
    act(async () =>
      root.render(
        <RecoverableEnvironment
          key={`${environment}-${request}`}
          environment={environment}
          reducedMotion
          onReady={ready}
        />,
      ),
    );
  await renderLighting("studio");
  await frame();
  expect(counts()).toEqual({
    reflection: 6,
    shadow: 1,
    directional: STUDIO_SHADOW_DRAWS,
  });
  store.getState().camera.position.y = 3.8;
  await frame();
  expect(counts().directional).toBe(STUDIO_SHADOW_DRAWS);
  store.getState().camera.position.y = 3.81;
  await frame();
  expect(counts()).toEqual({
    reflection: 6,
    shadow: 1,
    directional: STUDIO_SHADOW_DRAWS * 2 - 28,
  });
  store.getState().camera.position.y = 10;
  await frame();
  expect(counts().directional).toBe(STUDIO_SHADOW_DRAWS * 2 - 28);
  store.getState().camera.position.y = 3.8;
  await frame();
  expect(counts()).toEqual({
    reflection: 6,
    shadow: 1,
    directional: STUDIO_SHADOW_DRAWS * 3 - 28,
  });
  await renderLighting("gallery");
  await frame();
  expect(counts()).toEqual({
    reflection: 12,
    shadow: 2,
    directional: STUDIO_SHADOW_DRAWS * 3 - 28 + 52,
  });
  await frame();
  expect(counts().directional).toBe(STUDIO_SHADOW_DRAWS * 3 - 28 + 52);
  await renderLighting("night");
  await frame();
  expect(counts()).toEqual({
    reflection: 18,
    shadow: 3,
    directional: STUDIO_SHADOW_DRAWS * 3 - 28 + 52 + 398,
  });
  await renderLighting("night", 1);
  await frame();
  expect(counts()).toEqual({
    reflection: 24,
    shadow: 4,
    directional: STUDIO_SHADOW_DRAWS * 3 - 28 + 52 + 398 * 2,
  });
  await frame();
  expect(counts().directional).toBe(
    STUDIO_SHADOW_DRAWS * 3 - 28 + 52 + 398 * 2,
  );
});

it("waits for suspended coast rocks before the first cached main shadow capture", async () => {
  const { root, store, frame, counts, roadsideCount } = await setup();
  inputs.rockSource = new RockGroup();
  const rock = new RockMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial(),
  );
  rock.name = "deferred-shadow-rock";
  inputs.rockSource.add(rock);
  inputs.rockReady = false;
  let release!: () => void;
  inputs.rockPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = vi.fn(),
    fallback = vi.fn();
  await act(async () =>
    root.render(
      <RecoverableEnvironment
        environment="coast"
        reducedMotion
        onReady={ready}
        onFallback={fallback}
      />,
    ),
  );
  await frame();
  expect(counts()).toEqual({ reflection: 0, shadow: 0, directional: 0 });
  expect(roadsideCount()).toBe(0);
  expect(
    store.getState().scene.getObjectByName("scanned-roadside-rocks"),
  ).toBeUndefined();
  await act(async () => {
    inputs.rockReady = true;
    release();
    await inputs.rockPromise;
  });
  await frame();
  expect(fallback).not.toHaveBeenCalled();
  const mounted = store
    .getState()
    .scene.getObjectByName("scanned-roadside-rocks");
  expect(mounted).toBeDefined();
  expect(mounted!.children).toHaveLength(7);
  expect(roadsideCount()).toBe(7);
  expect(counts().reflection).toBe(6);
  expect(counts().shadow).toBe(1);
  const captured = counts().directional;
  expect(captured).toBeGreaterThan(7);
  await frame();
  expect(counts().directional).toBe(captured);
  expect(roadsideCount()).toBe(7);
});
