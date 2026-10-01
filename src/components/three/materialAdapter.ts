import {
  Box3,
  BufferGeometry,
  Color,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Texture,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  interpolationAlpha,
  materialRole,
  normalizeBounds,
} from "./sceneHelpers";
import type { MaterialRole, MaterialRoles, VectorTuple } from "./sceneHelpers";

type Binding = { material: MeshStandardMaterial; role: MaterialRole };
export type PreparedVehicle = ReturnType<typeof prepareVehicle>;

/** Owns this load's geometry/textures. Call once on disposal, not on cached useGLTF assets. */
export function disposeVehicleObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const bitmaps = new Set<ImageBitmap>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    list.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof Texture) textures.add(value);
      });
    });
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => {
    const images = Array.isArray(texture.image)
      ? texture.image
      : [texture.image];
    for (const image of images)
      if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
        bitmaps.add(image);
    texture.dispose();
  });
  bitmaps.forEach((bitmap) => bitmap.close());
  materials.forEach((material) => material.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
}

export function prepareVehicle(
  source: Object3D,
  roles: MaterialRoles,
  disabledEmissive: string[] = [],
) {
  const scene = clone(source);
  const bindings: Binding[] = [];
  const inactiveMaterials = new Set(disabledEmissive);
  const copies = new Map<Material, Map<MaterialRole | null, Material>>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const adapt = (original: Material) => {
      const role = materialRole(original.name, object.name, roles);
      let variants = copies.get(original);
      if (!variants) {
        variants = new Map();
        copies.set(original, variants);
      }
      const existing = variants.get(role);
      if (existing) return existing;
      let material = original.clone();
      if (role === "paint" && original instanceof MeshStandardMaterial) {
        if (!(material instanceof MeshPhysicalMaterial)) {
          material = new MeshPhysicalMaterial();
          MeshStandardMaterial.prototype.copy.call(material, original);
        }
        const paint = material as MeshPhysicalMaterial;
        paint.clearcoat = 1;
        paint.clearcoatRoughness = 0.12;
        paint.metalness = 0.78;
        paint.roughness = 0.23;
      }
      const keepUnlit = inactiveMaterials.has(original.name);
      if (keepUnlit && material instanceof MeshStandardMaterial)
        material.emissiveIntensity = 0;
      if (role && !keepUnlit && material instanceof MeshStandardMaterial)
        bindings.push({ material, role });
      variants.set(role, material);
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(adapt)
      : adapt(object.material);
  });
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const normalized = normalizeBounds({
    min: bounds.min.toArray() as VectorTuple,
    max: bounds.max.toArray() as VectorTuple,
  });
  let disposed = false;
  return {
    scene,
    bindings,
    ...normalized,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeVehicleObject(scene);
    },
  };
}

const targetPaintColor = new Color();

/** Advances paint in linear color space without replacing PBR materials or maps. */
export function stepVehicleAppearance(
  bindings: Binding[],
  paint: string,
  lights: boolean,
  delta: number,
  reducedMotion: boolean,
) {
  targetPaintColor.set(paint);
  const alpha = interpolationAlpha(delta, reducedMotion);
  let settled = true;
  for (const binding of bindings) {
    if (binding.role === "paint") {
      binding.material.color.lerp(targetPaintColor, alpha);
      const { r, g, b } = binding.material.color;
      if (
        Math.max(
          Math.abs(r - targetPaintColor.r),
          Math.abs(g - targetPaintColor.g),
          Math.abs(b - targetPaintColor.b),
        ) < 0.0001
      ) {
        binding.material.color.copy(targetPaintColor);
      } else settled = false;
    } else {
      binding.material.emissive.set(
        binding.role === "headlights" ? "#f5f2e9" : "#ff2118",
      );
      binding.material.emissiveIntensity = lights
        ? binding.role === "headlights"
          ? 3
          : 2
        : 0;
    }
  }
  return settled;
}

/** Immediate initialization path, also used for reduced-motion preferences. */
export function applyVehicleAppearance(
  bindings: Binding[],
  paint: string,
  lights: boolean,
) {
  stepVehicleAppearance(bindings, paint, lights, 0, true);
}

export function vehicleCapabilities(bindings: Binding[]) {
  return {
    paint: bindings.some((binding) => binding.role === "paint"),
    lights: bindings.some(
      (binding) =>
        binding.role === "headlights" || binding.role === "taillights",
    ),
  };
}
