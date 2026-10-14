// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Texture,
} from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";
import { prepareVehicle } from "../src/components/three/materialAdapter";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";

// This fixture replaces R3F with a non-rendering host. Actual admission,
// resize, visibility and cleanup are exercised in rear-demand-admission.test.
vi.mock("../src/components/three/DemandRenderBackpressure", () => ({
  DemandRenderBackpressure: () => null,
}));

const runtime = vi.hoisted(() => ({
  state: {} as any,
  asset: null as any,
  cards: [] as any[],
}));
// Retain the actual material effect and Three objects; a DOM test cannot render
// WebGL host elements. Pixel quality is covered by the preview browser review.
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("react/jsx-runtime")>();
  const { Fragment } = await import("react");
  return {
    ...original,
    jsx: (type: any, props: any, key: any) =>
      original.jsx(
        typeof type === "string" ? Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        key,
      ),
    jsxs: (type: any, props: any, key: any) =>
      original.jsxs(
        typeof type === "string" ? Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        key,
      ),
  };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("react/jsx-dev-runtime")>();
  const { Fragment } = await import("react");
  return {
    ...original,
    jsxDEV: (type: any, props: any, ...rest: any[]) =>
      (original.jsxDEV as any)(
        typeof type === "string" ? Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        ...rest,
      ),
  };
});
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => children,
  useThree: (select: (state: any) => unknown) => select(runtime.state),
  useFrame: () => {},
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => runtime.asset,
}));
vi.mock("../src/components/three/StageGeometry", () => ({
  StageGeometry: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../src/components/home/useRearRenderPreparation", () => ({
  useRearRenderPreparation: () => {},
}));
vi.mock("@react-three/drei/core/Environment", () => ({
  Environment: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: (props: any) => {
    runtime.cards.push(props);
    return null;
  },
}));
vi.mock("@react-three/drei/core/ContactShadows", () => ({
  ContactShadows: () => null,
}));

let source: Group;
let asset: PreparedVehicle;
function addMesh(name: string, material: MeshStandardMaterial) {
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = name;
  source.add(mesh);
  return mesh;
}
function material(name: string) {
  return (asset.scene.getObjectByName(name) as Mesh)
    .material as MeshStandardMaterial;
}
function mount() {
  return render(
    <RearVehicleScene
      progress={1}
      reducedMotion
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
}
beforeEach(() => {
  runtime.cards = [];
  source = new Group();
  const paint = new MeshPhysicalMaterial({
    color: "#656a6d",
    metalness: 0.68,
    roughness: 0.28,
  });
  paint.name = "CarPaint";
  paint.normalMap = new Texture();
  for (let i = 0; i < 8; i++) addMesh(`Body${i}_CarPaint_0`, paint);
  const carbon = new MeshStandardMaterial({
    color: "#202226",
    roughness: 0.24,
    metalness: 0.5,
    side: DoubleSide,
  });
  carbon.name = "Carbon_Fiber";
  carbon.map = new Texture();
  carbon.normalMap = new Texture();
  carbon.roughnessMap = new Texture();
  addMesh("Spoiler_Carbon_Fiber_0", carbon);
  addMesh("Rear_Bumper_Grid_Carbon_Fiber_0", carbon);
  const lens = new MeshStandardMaterial({
    color: "#69000a",
    opacity: 0.2,
    transparent: true,
  });
  lens.name = "Glass.001";
  addMesh("TailightsGlass_Glass001_0", lens);
  const tube = new MeshStandardMaterial();
  tube.name = "Taillight_Emitter";
  addMesh("Taillights001_RedLight_0", tube);
  const glass = new MeshStandardMaterial({
    color: "#000000",
    roughness: 0,
    opacity: 0.89,
    transparent: true,
  });
  glass.name = "Window_Glass";
  addMesh("RearWindow_Glass_0", glass);
  addMesh("DoorWindow_Glass_0", glass);
  const metal = new MeshStandardMaterial({
    color: "#adadad",
    metalness: 1,
    roughness: 0.16,
  });
  metal.name = "Metal";
  metal.roughnessMap = new Texture();
  for (const part of [
    "Taillights001_Metal_0",
    "Taillights002_Metal_0",
    "Taillights003_Metal_0",
    "NissanLogo_Metal_0",
  ])
    addMesh(part, metal);
  for (const name of ["Headlight_Emitter", "Reverse_Emitter"]) {
    const emitter = new MeshStandardMaterial({
      emissive: "white",
      emissiveIntensity: 10,
    });
    emitter.name = name;
    addMesh(name, emitter);
  }
  asset = prepareVehicle(
    source,
    {
      paint: ["CarPaint"],
      headlights: ["Headlight_Emitter"],
      taillights: ["Taillight_Emitter"],
    },
    ["Reverse_Emitter"],
  );
  runtime.asset = asset;
  runtime.state = {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    size: { width: 1440, height: 900 },
    invalidate: () => {},
    gl: { domElement: document.createElement("canvas") },
  };
});
afterEach(() => {
  cleanup();
  asset.dispose();
  vi.restoreAllMocks();
});

it("gives all eight original paint panels a satin white response while preserving their maps and geometry", () => {
  const geometry = (asset.scene.getObjectByName("Body0_CarPaint_0") as Mesh)
    .geometry;
  const normalMap = material("Body0_CarPaint_0").normalMap;
  mount();
  for (let i = 0; i < 8; i++) {
    const paint = material(`Body${i}_CarPaint_0`) as MeshPhysicalMaterial;
    expect(paint.color.getHexString()).toBe("ecebe6");
    expect(paint.metalness).toBe(0.22);
    expect(paint.roughness).toBe(0.36);
    expect(paint.clearcoat).toBe(0.8);
    expect(paint.clearcoatRoughness).toBe(0.12);
    expect(paint.normalMap).toBe(normalMap);
  }
  expect(
    (asset.scene.getObjectByName("Body0_CarPaint_0") as Mesh).geometry,
  ).toBe(geometry);
  expect(
    (source.getObjectByName("Body0_CarPaint_0") as Mesh).material,
  ).not.toBe(material("Body0_CarPaint_0"));
});

it("lights the actual broad annular lens covers more strongly than the thin emitter tubes", () => {
  mount();
  const lens = material("TailightsGlass_Glass001_0");
  const tube = material("Taillights001_RedLight_0");
  expect(lens.emissive.r).toBeGreaterThan(0.9);
  expect(lens.emissive.g).toBeLessThan(lens.emissive.r * 0.02);
  expect(lens.emissiveIntensity).toBe(0.55);
  expect(lens.opacity).toBe(0.96);
  expect(lens.color.getHexString()).toBe("35040a");
  expect(lens.toneMapped).toBe(true);
  expect(tube.toneMapped).toBe(true);
  expect(tube.emissiveIntensity).toBe(0.14);
  expect(tube.emissiveIntensity).toBeLessThan(lens.emissiveIntensity);
  expect(material("Headlight_Emitter").emissiveIntensity).toBe(0);
  expect(material("Reverse_Emitter").emissiveIntensity).toBe(0);
});

it("retains the authored shared carbon wing material, maps and geometry without a white paint substitute", () => {
  const carbon = material("Rear_Bumper_Grid_Carbon_Fiber_0");
  const carbonColor = carbon.color.clone();
  const maps = [carbon.map, carbon.normalMap, carbon.roughnessMap];
  const geometry = (
    asset.scene.getObjectByName("Spoiler_Carbon_Fiber_0") as Mesh
  ).geometry;
  expect(material("Spoiler_Carbon_Fiber_0")).toBe(carbon);
  mount();
  const spoiler = material("Spoiler_Carbon_Fiber_0");
  expect(spoiler).toBe(carbon);
  expect(spoiler.name).toBe("Carbon_Fiber");
  expect(spoiler.color.equals(carbonColor)).toBe(true);
  expect([spoiler.map, spoiler.normalMap, spoiler.roughnessMap]).toEqual(maps);
  expect(spoiler.metalness).toBe(0.5);
  expect(spoiler.roughness).toBe(0.24);
  expect(spoiler.side).toBe(DoubleSide);
  expect(
    (asset.scene.getObjectByName("Spoiler_Carbon_Fiber_0") as Mesh).geometry,
  ).toBe(geometry);
});

it("darkens only the three lamp housing meshes while leaving shared chrome badges untouched", () => {
  const badge = material("NissanLogo_Metal_0");
  const badgeColor = badge.color.clone();
  mount();
  for (const name of [
    "Taillights001_Metal_0",
    "Taillights002_Metal_0",
    "Taillights003_Metal_0",
  ]) {
    const housing = material(name);
    expect(housing).not.toBe(badge);
    expect(housing.color.r).toBeLessThan(new Color("#333333").r);
    expect(housing.metalness).toBeLessThanOrEqual(0.3);
    expect(housing.roughness).toBeGreaterThanOrEqual(0.35);
    expect(housing.emissiveIntensity).toBe(0);
    expect(housing.roughnessMap).toBe(badge.roughnessMap);
  }
  expect(material("NissanLogo_Metal_0")).toBe(badge);
  expect(badge.color.equals(badgeColor)).toBe(true);
  expect(badge.metalness).toBe(1);
});

it("uses dark roughened glass with restrained physical specular reflection instead of an ineffective environment scalar", () => {
  mount();
  const glass = material("RearWindow_Glass_0") as MeshPhysicalMaterial;
  expect(glass).toBeInstanceOf(MeshPhysicalMaterial);
  expect(glass).toHaveProperty("defines.PHYSICAL", "");
  expect(glass.color.r).toBeLessThan(new Color("#16191d").r);
  expect(glass.roughness).toBeGreaterThanOrEqual(0.1);
  expect(glass.roughness).toBeLessThanOrEqual(0.16);
  expect(glass.specularIntensity).toBeLessThanOrEqual(0.25);
  expect(glass.envMap).toBeNull();
  expect(material("DoorWindow_Glass_0")).toBe(glass);
});

it("keeps selective material copies stable on effect re-entry and disposes them with their owned asset", () => {
  const first = mount();
  const housing = material("Taillights001_Metal_0");
  const glass = material("RearWindow_Glass_0");
  const spoiler = material("Spoiler_Carbon_Fiber_0");
  expect(housing).not.toBe(material("NissanLogo_Metal_0"));
  const disposeHousing = vi.spyOn(housing, "dispose");
  const disposeGlass = vi.spyOn(glass, "dispose");
  const disposeSpoiler = vi.spyOn(spoiler, "dispose");
  const disposeMaps = [
    spoiler.map!,
    spoiler.normalMap!,
    spoiler.roughnessMap!,
  ].map((map) => vi.spyOn(map, "dispose"));
  first.unmount();
  mount();
  expect(material("Taillights001_Metal_0")).toBe(housing);
  expect(material("RearWindow_Glass_0")).toBe(glass);
  expect(material("Spoiler_Carbon_Fiber_0")).toBe(spoiler);
  asset.dispose();
  expect(disposeHousing).toHaveBeenCalledTimes(1);
  expect(disposeGlass).toHaveBeenCalledTimes(1);
  expect(disposeSpoiler).toHaveBeenCalledTimes(1);
  for (const disposeMap of disposeMaps)
    expect(disposeMap).toHaveBeenCalledTimes(1);
});

it("keeps frontal reflection cards dimmer and narrower than the body-shaping overhead source", () => {
  mount();
  const frontal = runtime.cards.filter((card) => card.position[2] <= -4);
  expect(frontal).toHaveLength(2);
  for (const card of frontal) {
    expect(card.intensity).toBeLessThanOrEqual(0.65);
    expect(card.scale[0]).toBeLessThanOrEqual(4);
  }
  const overhead = runtime.cards.find((card) => card.position[1] >= 4);
  expect(overhead.intensity).toBeGreaterThanOrEqual(2);
});

function compiled(material: MeshStandardMaterial) {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader as any, {} as any);
  return shader;
}

it("keeps authored carbon unmodified by artificial diffuse bounce or emission", () => {
  mount();
  const spoiler = material("Spoiler_Carbon_Fiber_0");
  expect(compiled(spoiler).fragmentShader).toBe(
    ShaderLib.physical.fragmentShader,
  );
  expect(spoiler.emissive.getHexString()).toBe("000000");
  expect(spoiler.envMap).toBeNull();
});

it("suppresses the grazing direct-area reflection on real window glass after r180 lighting evaluation", () => {
  mount();
  const glass = material("RearWindow_Glass_0");
  const shader = compiled(glass);
  expect(shader.fragmentShader).toMatch(
    /#include <lights_fragment_end>\s+reflectedLight.directSpecular \*= 0\.045;/,
  );
  expect(shader.fragmentShader).toContain(
    "#include <lights_physical_fragment>",
  );
  expect(glass.customProgramCacheKey()).toBe("rear-window-ltc-v1");
  expect(compiled(material("NissanLogo_Metal_0")).fragmentShader).not.toContain(
    "directSpecular *= 0.045",
  );
});

it("grades the real annular lens emission from a luminous band to dark red edges using source-local positions", () => {
  mount();
  const lens = material("TailightsGlass_Glass001_0");
  const shader = compiled(lens);
  expect(shader.vertexShader).toContain("vRearLensPosition = position.xy;");
  expect(shader.fragmentShader).toContain("uniform vec4 rearLensBands[4];");
  expect(shader.fragmentShader).toContain(
    "exp(-2.4 * rearBandDistance * rearBandDistance)",
  );
  expect(shader.fragmentShader).toContain(
    "totalEmissiveRadiance *= mix(0.1, 1.0, rearCore);",
  );
  const bands = (shader.uniforms as any).rearLensBands.value;
  expect(bands).toHaveLength(4);
  expect(bands.map((band: any) => band.x)).toEqual([
    -0.87364, -0.61782, 0.61782, 0.87364,
  ]);
  expect(shader.fragmentShader).not.toContain("totalEmissiveRadiance +=");
  expect(lens.customProgramCacheKey()).toBe("rear-lens-profile-v2");
});

it("binds the window fix and four emission profiles to the decoded published asset rather than fixture names", async () => {
  const { readFileSync } = await import("node:fs");
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { MeshoptDecoder } =
    await import("three/examples/jsm/libs/meshopt_decoder.module.js");
  const loader = new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .register((parser) => {
      // Texture pixels are immaterial to mesh/material correspondence; keep the
      // actual compressed geometry, authored names, transforms and materials.
      (parser as any).loadTextureImage = () => Promise.resolve(new Texture());
      return { name: "MappingWithoutImageDecode" };
    });
  // Unit CI runs before build-time public/model reconstruction. Read the same
  // committed, checksum-pinned chunks without depending on a prior local build.
  const { createHash } = await import("node:crypto");
  const manifest = JSON.parse(readFileSync("modeldata/manifest.json", "utf8"));
  const entry = manifest.find(
    (item: { id: string }) => item.id === "ciasny-r35",
  );
  const bytes = Buffer.concat(
    entry.chunks.map((chunk: { path: string }) =>
      readFileSync(`modeldata/${chunk.path}`),
    ),
  );
  expect(bytes.byteLength).toBe(entry.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const loaded = await loader.parseAsync(buffer, "");
  asset.dispose();
  asset = prepareVehicle(
    loaded.scene,
    {
      paint: ["CarPaint"],
      headlights: ["Headlight_Emitter"],
      taillights: ["Taillight_Emitter"],
    },
    ["Reverse_Emitter"],
  );
  runtime.asset = asset;
  const grille = material("Rear_Bumper_Grid_Carbon_Fiber_0");
  const grilleColor = grille.color.clone();
  const grilleMap = grille.map;
  expect(material("Spoiler_Carbon_Fiber_0")).toBe(grille);
  mount();
  const spoiler = material("Spoiler_Carbon_Fiber_0");
  expect(spoiler).toBe(grille);
  expect(spoiler.name).toBe("Carbon_Fiber");
  expect(spoiler.color.equals(grilleColor)).toBe(true);
  expect(spoiler.map).toBe(grilleMap);
  expect(spoiler.map).toBeInstanceOf(Texture);
  expect(spoiler.normalMap).toBeInstanceOf(Texture);
  expect(spoiler.roughnessMap).toBeInstanceOf(Texture);
  expect(spoiler.metalness).toBe(0);
  expect(compiled(spoiler).fragmentShader).toBe(
    ShaderLib.physical.fragmentShader,
  );
  expect(material("Rear_Bumper_Grid_Carbon_Fiber_0")).toBe(grille);
  expect(grille.color.equals(grilleColor)).toBe(true);
  expect(grille.map).toBe(grilleMap);
  expect(material("Rear_Window_Glass_0").name).toBe("Window_Glass");
  expect(compiled(material("Rear_Window_Glass_0")).fragmentShader).toContain(
    "directSpecular *= 0.045",
  );
  const lens = asset.scene.getObjectByName("TailightsGlass_Glass001_0") as Mesh;
  const shader = compiled(lens.material as MeshStandardMaterial);
  const bands = (shader.uniforms as any).rearLensBands.value;
  const position = lens.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const normalizedBandDistance = Math.min(
      ...bands.map((band: any) => {
        const radius = Math.hypot(
          position.getX(i) - band.x,
          position.getY(i) - band.y,
        );
        return (
          Math.abs(radius - (band.z + band.w) / 2) / ((band.w - band.z) / 2)
        );
      }),
    );
    expect(normalizedBandDistance).toBeLessThan(1.02);
  }
});
