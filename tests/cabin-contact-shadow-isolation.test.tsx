// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { act, advance, createRoot, extend, _roots } from "@react-three/fiber";
import { ContactShadows as OriginalContactShadows } from "@react-three/drei/core/ContactShadows";
import { OwnedContactShadows } from "../src/components/three/OwnedContactShadows";
import { Frustum, Matrix4, Mesh, Texture, Vector3 } from "three";
import type {
  Camera,
  Group,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { WebGLRenderList } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { CabinAttachment } from "../src/components/three/CabinAttachment";
import { StageGeometry } from "../src/components/three/StageGeometry";
import { createVehicleLoader } from "../src/components/three/createVehicleLoader";
import { createCabinWindowOwner } from "../src/components/three/cabinPreview";
import {
  prepareVehicle,
  type PreparedVehicle,
} from "../src/components/three/materialAdapter";
import { models } from "../src/data/models";

// Real decompressed GLBs, preparation, attachment ownership, Drei capture,
// camera/frustum selection and Three sorting. Only image IO, compilation and
// the GPU device are replaced. No browser, server, socket or pixel claim.
const THREE: typeof import("three") = createRequire(import.meta.url)("three");
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  OrthographicCamera: THREE.OrthographicCamera,
});
vi.mock("../src/components/home/compileRearScene", () => ({
  compileRearScene: () => Promise.resolve(),
}));
const roots: ReturnType<typeof createRoot>[] = [];
const owned: PreparedVehicle[] = [];
let sources: { exterior: Group; proxy: Group; full: Group };
beforeAll(async () => {
  const manifest = JSON.parse(
    readFileSync("modeldata/manifest.json", "utf8"),
  )[0];
  const exterior = Buffer.concat(
    manifest.chunks.map((part: { path: string }) =>
      readFileSync(`modeldata/${part.path}`),
    ),
  );
  const proxy = gunzipSync(
    readFileSync("qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz"),
  );
  const full = gunzipSync(
    readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz"),
  );
  const load = async (bytes: Buffer, sha: string) => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
    const loader = createVehicleLoader().register((parser) => {
      (
        parser as unknown as { loadTextureImage: () => Promise<Texture> }
      ).loadTextureImage = () => Promise.resolve(new Texture());
      return { name: "SocketFreeTextureIO" };
    });
    return (await loader.parseAsync(Uint8Array.from(bytes).buffer, "")).scene;
  };
  sources = {
    exterior: await load(
      exterior,
      "fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d",
    ),
    proxy: await load(
      proxy,
      "49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347",
    ),
    full: await load(
      full,
      "5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326",
    ),
  };
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  owned.splice(0).forEach((asset) => asset.dispose());
  vi.unstubAllGlobals();
});
function asset(kind: keyof typeof sources) {
  const prepared = prepareVehicle(
    sources[kind],
    kind === "exterior"
      ? models[0].asset.materialRoles
      : { paint: [], headlights: [], taillights: [] },
    kind === "exterior" ? models[0].asset.disabledEmissive : [],
    kind !== "exterior",
  );
  prepared.scene.traverse((object) => {
    object.userData.captureOwner = kind;
  });
  owned.push(prepared);
  return prepared;
}

// Mirrors WebGLRenderer.projectObject's visibility/layers/frustum and original
// material lists. Real WebGLRenderList performs the actual opaque/transparent
// ordering before scene.overrideMaterial is selected for the draw.
function captureList(scene: Scene, camera: Camera) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const projection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new Frustum().setFromProjectionMatrix(projection);
  const point = new Vector3();
  const list = new WebGLRenderList(undefined as never);
  list.init();
  const project = (object: import("three").Object3D, groupOrder = 0) => {
    if (!object.visible) return;
    if (object.layers.test(camera.layers)) {
      if ((object as Group).isGroup) groupOrder = object.renderOrder;
      else if ((object as Mesh).isMesh) {
        const mesh = object as Mesh;
        if (!mesh.frustumCulled || frustum.intersectsObject(mesh)) {
          if (!mesh.geometry.boundingSphere)
            mesh.geometry.computeBoundingSphere();
          point
            .copy(mesh.geometry.boundingSphere!.center)
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(projection);
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials)
            if (material.visible)
              list.push(
                mesh,
                mesh.geometry,
                material,
                groupOrder,
                point.z,
                null,
              );
        }
      }
    }
    object.children.forEach((child) => project(child, groupOrder));
  };
  project(scene);
  list.sort(undefined as never, undefined as never);
  return [...list.opaque, ...list.transmissive, ...list.transparent].map(
    (entry) => ({
      owner: entry.object.userData.captureOwner,
      name: entry.object.name,
      castShadow: entry.object.castShadow,
    }),
  );
}

async function setup(
  kind: "proxy" | "full",
  warm: boolean,
  order: "exterior-first" | "cabin-first",
  ContactShadows = OwnedContactShadows,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const [first, second] =
    order === "cabin-first"
      ? [asset(kind), asset("exterior")]
      : [asset("exterior"), asset(kind)];
  const exterior = order === "cabin-first" ? second : first;
  const cabin = order === "cabin-first" ? first : second;
  const canvas = document.createElement("canvas");
  let target: WebGLRenderTarget | null = null;
  const captures: ReturnType<typeof captureList>[] = [];
  const passes: unknown[] = [];
  const targets = new Map<WebGLRenderTarget, number>();
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    autoClear: true,
    shadowMap: { enabled: false },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setPixelRatio() {},
    getPixelRatio: () => 1,
    setSize() {},
    getSize: (size: Vector2) => size.set(390, 372),
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
      if (next && !targets.has(next)) targets.set(next, targets.size + 1);
      passes.push({ target: next ? targets.get(next) : null });
    },
    render(scene: Scene, camera: Camera) {
      if (scene.isScene && scene.overrideMaterial) {
        expect(scene.overrideMaterial.depthTest).toBe(false);
        expect(scene.overrideMaterial.depthWrite).toBe(false);
        captures.push(captureList(scene, camera));
        const shader = {
          uniforms: {},
          fragmentShader:
            "void main() {\nvec4( vec3( 1.0 - fragCoordZ ), opacity );",
        };
        scene.overrideMaterial.onBeforeCompile(
          shader as never,
          renderer as unknown as WebGLRenderer,
        );
        passes.push({
          depth: hash(shader),
          camera: camera.projectionMatrix.toArray(),
          size: [target?.width, target?.height],
          mipmaps: target?.texture.generateMipmaps,
        });
      } else if ((scene as unknown as Mesh).isMesh) {
        const mesh = scene as unknown as Mesh,
          material = mesh.material as import("three").ShaderMaterial;
        passes.push({
          blur: hash([material.vertexShader, material.fragmentShader]),
          attributes: hash(
            Object.fromEntries(
              Object.entries(mesh.geometry.attributes).map(([key, attr]) => [
                key,
                Array.from((attr as import("three").BufferAttribute).array),
              ]),
            ),
          ),
          index: hash(Array.from(mesh.geometry.index!.array)),
          h: material.uniforms.h?.value,
          v: material.uniforms.v?.value,
          depthTest: material.depthTest,
          camera: camera.projectionMatrix.toArray(),
        });
      }
    },
    renderLists: { dispose() {} },
    forceContextLoss() {},
  };
  const root = createRoot(canvas);
  roots.push(root);
  await root.configure({
    gl: renderer as unknown as WebGLRenderer,
    frameloop: "never",
    size: { width: 390, height: 372, top: 0, left: 0 },
    camera: { position: [5.2155, 2.11995, 6.222] },
  });
  const store = _roots.get(canvas)!.store;
  const noop = () => {};
  // Production RecoverableEnvironment is memoized across attachment updates.
  const contact = (
    <StageGeometry>
      <ContactShadows
        position={[0, -0.001, 0]}
        scale={12}
        far={4.5}
        resolution={512}
        blur={2.1}
        frames={1}
      />
    </StageGeometry>
  );
  const render = (withCabin: boolean, withContact: boolean) =>
    act(async () =>
      root.render(
        <>
          <group
            scale={exterior.scale}
            position={exterior.position}
            dispose={null}
          >
            <primitive object={exterior.scene} dispose={null} />
          </group>
          <CabinAttachment
            exterior={exterior}
            proxy={withCabin && kind === "proxy" ? cabin : null}
            asset={withCabin && kind === "full" ? cabin : null}
            active={kind === "full"}
            request={1}
            onReady={noop}
            onError={noop}
          />
          {withContact && contact}
        </>,
      ),
    );
  const frame = () => act(async () => advance(1, false, store.getState()));
  if (warm) {
    await render(true, false);
    await render(true, true);
  } else await render(false, true);
  await frame();
  expect(captures).toHaveLength(1);
  if (!warm) {
    await render(true, true);
    await frame();
  }
  // Stable environment inputs retain the one-shot contact map.
  await frame();
  expect(captures).toHaveLength(1);
  const main = store.getState().camera;
  let cabinMeshes = 0;
  cabin.scene.traverse((object) => {
    if (object instanceof Mesh) {
      cabinMeshes++;
      expect(main.layers.test(object.layers)).toBe(true);
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
    }
  });
  expect(cabinMeshes).toBeGreaterThan(0);
  return { capture: captures[0], exterior, store, cabin, passes };
}

it.each(["proxy", "full"] as const)(
  "keeps %s out of real one-shot contact depth for cold and warm allocation orders",
  async (kind) => {
    const cold = await setup(kind, false, "exterior-first");
    expect(cold.capture.length).toBeGreaterThan(80);
    expect(cold.capture.every((mesh) => mesh.owner === "exterior")).toBe(true);
    for (const order of ["exterior-first", "cabin-first"] as const) {
      const warm = await setup(kind, true, order);
      expect(warm.capture.filter((mesh) => mesh.owner === kind)).toEqual([]);
      expect(warm.capture).toEqual(cold.capture);
    }
  },
);

it("retains exact exterior contact ordering across original BLEND glass and owned thin glass", async () => {
  const exterior = asset("exterior");
  const main = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.scale.setScalar(exterior.scale);
  group.position.fromArray(exterior.position);
  group.add(exterior.scene);
  scene.add(group);
  const contact = new THREE.OrthographicCamera(-6, 6, 6, -6, 0, 4.5);
  contact.position.y = -0.001;
  contact.rotation.x = Math.PI / 2;
  const owner = createCabinWindowOwner(exterior.scene);
  try {
    const original = captureList(scene, contact).filter(
      (mesh) => mesh.owner === "exterior",
    );
    owner.setTransparent(true);
    const thin = captureList(scene, contact).filter(
      (mesh) => mesh.owner === "exterior",
    );
    expect(thin).toEqual(original);
    exterior.scene.traverse((object) => {
      if (object instanceof Mesh) {
        expect(main.layers.test(object.layers)).toBe(true);
        expect(contact.layers.test(object.layers)).toBe(true);
      }
    });
  } finally {
    owner.dispose();
  }
});

it("preserves byte-identical contact geometry/shader inputs and exact pass order from installed Drei", async () => {
  const original = await setup(
    "proxy",
    false,
    "exterior-first",
    OriginalContactShadows,
  );
  const owned = await setup("proxy", false, "exterior-first");
  expect(owned.passes).toEqual(original.passes);
  expect(owned.capture).toEqual(original.capture);
});
