import {
  Color,
  Group,
  Mesh,
  Texture,
  Vector4,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import type { PreparedVehicle } from "./materialAdapter";
import { configureCabinLayers } from "./stageLayers";

type Program = NonNullable<WebGLRenderer["info"]["programs"]>[number];
export type CabinPreparationStep = {
  kind: "compile" | "texture" | "geometry";
  run: () => void | { poll: () => boolean };
};
const MAX_BATCH_MESHES = 4;
const MAX_BATCH_TRIANGLES = 64_000;

/** No timer here: the single renderer admission owner polls this ticket. */
function compiledPrograms(renderer: WebGLRenderer, materials: Set<Material>) {
  let pendingSince: number | undefined;
  const context = renderer.getContext();
  const extension = context.getExtension("KHR_parallel_shader_compile");
  const owners = new Set<Program>();
  for (const material of materials) {
    const properties = renderer.properties.get(material) as {
      programs?: Map<string, Program>;
      currentProgram?: Program;
    };
    // Double-sided transparent materials and object-dependent permutations can
    // have more than currentProgram. Keep all exact handles compiled so far.
    if (properties.programs?.size)
      for (const program of properties.programs.values()) owners.add(program);
    else if (properties.currentProgram) owners.add(properties.currentProgram);
    else throw new Error("The interior preparation program is missing.");
  }
  const programs = [...owners].map((owner) => ({
    owner,
    handle: owner.program,
  }));
  return {
    poll() {
      if (context.isContextLost())
        throw new Error("The graphics connection was interrupted.");
      let complete = true;
      for (const { owner, handle } of programs) {
        if (
          !handle ||
          owner.program !== handle ||
          !renderer.info.programs?.includes(owner)
        )
          throw new Error("The interior preparation resources were released.");
        if (
          extension &&
          !context.getProgramParameter(handle, extension.COMPLETION_STATUS_KHR)
        ) {
          complete = false;
          continue;
        }
        // Without KHR, the platform may block this native link query. This is
        // an explicit fallback, never described as asynchronous shader support.
        if (!context.getProgramParameter(handle, context.LINK_STATUS))
          throw new Error("The interior shaders could not link. Please retry.");
      }
      // This bounds a submitted batch's unresolved links, not the time spent
      // draining native commands or waiting behind ordinary display demand.
      if (!complete) {
        // The owner calls this only after the submitted native prefix drains.
        // Start here so a long native wait is not charged to shader linking.
        pendingSince ??= performance.now();
        if (performance.now() - pendingSince >= 30_000)
          throw new Error(
            "Interior shader preparation took too long. Please retry.",
          );
      }
      return complete;
    },
  };
}

/**
 * Build bounded jobs without allocating another renderer/target or cloning
 * GPU resources. Caller must keep the 3D stage opaque until final main proof.
 */
export function createCabinPreparationSteps(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  asset: PreparedVehicle,
  exterior: Pick<PreparedVehicle, "scale" | "position">,
  layout: "detached" | "integrated" = "detached",
): CabinPreparationStep[] {
  if (layout === "detached") configureCabinLayers(asset.scene, camera);
  const meshes: Mesh[] = [],
    textures = new Set<Texture>();
  asset.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (layout === "detached") object.castShadow = object.receiveShadow = false;
    meshes.push(object);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
  });
  const batches: Mesh[][] = [];
  let batch: Mesh[] = [],
    triangles = 0;
  for (const mesh of meshes) {
    const count =
      (mesh.geometry.index?.count ??
        mesh.geometry.attributes.position?.count ??
        0) / 3;
    if (
      batch.length &&
      (batch.length >= MAX_BATCH_MESHES ||
        triangles + count > MAX_BATCH_TRIANGLES)
    ) {
      batches.push(batch);
      batch = [];
      triangles = 0;
    }
    batch.push(mesh);
    triangles += count;
  }
  if (batch.length) batches.push(batch);
  const requireDefault = () => {
    if (renderer.getRenderTarget() !== null)
      throw new Error("Interior preparation requires the main render target.");
  };
  const steps: CabinPreparationStep[] = batches.map((batch) => ({
    kind: "compile",
    run() {
      requireDefault();
      const materials = new Set<Material>();
      for (const mesh of batch)
        for (const material of renderer.compile(mesh, camera, scene))
          materials.add(material);
      return compiledPrograms(renderer, materials);
    },
  }));
  for (const texture of textures)
    steps.push({
      kind: "texture",
      run() {
        requireDefault();
        renderer.initTexture(texture);
      },
    });
  for (const batch of batches)
    steps.push({
      kind: "geometry",
      run() {
        requireDefault();
        if (layout === "detached" && asset.scene.parent)
          throw new Error("Interior preparation must own a detached cabin.");
        if (layout === "integrated") {
          let owner: Object3D | null = asset.scene;
          while (owner && owner !== scene) owner = owner.parent;
          if (owner !== scene)
            throw new Error(
              "Integrated preparation requires the mounted whole-car scene.",
            );
        }
        const viewport = renderer.getViewport(new Vector4()),
          scissor = renderer.getScissor(new Vector4());
        const scissorTest = renderer.getScissorTest(),
          target = renderer.getRenderTarget();
        const autoClear = renderer.autoClear,
          shadowAuto = renderer.shadowMap.autoUpdate,
          shadowDirty = renderer.shadowMap.needsUpdate;
        const clearColor = renderer.getClearColor(new Color()),
          clearAlpha = renderer.getClearAlpha(),
          clearFlags = [
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil,
          ] as const;
        const background = scene.background;
        const flags: {
          object: Object3D;
          visible: boolean;
          frustumCulled: boolean;
        }[] = [];
        const group = new Group();
        group.scale.setScalar(exterior.scale);
        group.position.fromArray(exterior.position);
        const selected = new Set<Object3D>(batch);
        try {
          if (layout === "detached") {
            group.add(asset.scene);
            scene.add(group);
          }
          scene.traverse((object) => {
            const renderable = object as Object3D & {
              isMesh?: boolean;
              isLine?: boolean;
              isPoints?: boolean;
              isSprite?: boolean;
            };
            if (
              !renderable.isMesh &&
              !renderable.isLine &&
              !renderable.isPoints &&
              !renderable.isSprite
            )
              return;
            flags.push({
              object,
              visible: object.visible,
              frustumCulled: object.frustumCulled,
            });
            object.visible = selected.has(object);
            if (object.visible) object.frustumCulled = false;
          });
          scene.background = null;
          renderer.shadowMap.autoUpdate =
            renderer.shadowMap.needsUpdate = false;
          renderer.autoClear = true;
          renderer.setViewport(0, 0, 1, 1);
          renderer.setScissor(0, 0, 1, 1);
          renderer.setScissorTest(true);
          renderer.render(scene, camera);
        } finally {
          for (const flag of flags) {
            flag.object.visible = flag.visible;
            flag.object.frustumCulled = flag.frustumCulled;
          }
          if (layout === "detached") {
            group.remove(asset.scene);
            scene.remove(group);
          }
          scene.background = background;
          renderer.shadowMap.autoUpdate = shadowAuto;
          renderer.shadowMap.needsUpdate = shadowDirty;
          renderer.autoClear = autoClear;
          [
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil,
          ] = clearFlags;
          renderer.setClearColor(clearColor, clearAlpha);
          renderer.setRenderTarget(target);
          renderer.setViewport(viewport);
          renderer.setScissor(scissor);
          renderer.setScissorTest(scissorTest);
        }
      },
    });
  return steps;
}
