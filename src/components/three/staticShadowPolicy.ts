import type { Camera, DirectionalLight, Scene } from "three";

type Entry = {
  light: DirectionalLight;
  getCamera: () => Camera;
  revision: number;
  rendered: number;
  drawing: number;
};
type Cache = { entries: Set<Entry>; detach: () => void };
const caches = new WeakMap<Scene, Cache>();

/**
 * Dirty the directional depth maps when shadow-casting geometry, visibility,
 * transforms or depth-relevant material state changes. Camera look, paint and
 * emissive-only running-light changes do not need this. Call invalidate() too
 * when the mutation itself does not already schedule a demand-render frame.
 */
export function invalidateSceneShadows(scene: Scene): void {
  caches.get(scene)?.entries.forEach((entry) => entry.revision++);
}

/**
 * Cache only explicitly registered stationary lights, not the whole renderer.
 * The first ContactShadows pass uses a layer-0 camera; it must not consume a
 * refresh intended for the main camera, whose layers also include the venue.
 */
export function cacheDirectionalShadow(
  scene: Scene,
  light: DirectionalLight,
  getCamera: () => Camera,
): () => void {
  let cache = caches.get(scene);
  if (!cache) {
    const entries = new Set<Entry>();
    const previousBefore = scene.onBeforeRender;
    const previousAfter = scene.onAfterRender;
    const before: Scene["onBeforeRender"] = function (...args) {
      previousBefore.apply(scene, args);
      const [, , camera, target] = args;
      if (target !== null) return;
      entries.forEach((entry) => {
        if (camera !== entry.getCamera() || entry.rendered === entry.revision)
          return;
        entry.drawing = entry.revision;
        entry.light.shadow.needsUpdate = true;
      });
    };
    const after: Scene["onAfterRender"] = function (...args) {
      previousAfter.apply(scene, args);
      const [renderer, , camera] = args;
      if (renderer.getRenderTarget() !== null) return;
      entries.forEach((entry) => {
        const shadow = entry.light.shadow;
        if (camera === entry.getCamera() && shadow.map && !shadow.needsUpdate)
          entry.rendered = entry.drawing;
      });
    };
    scene.onBeforeRender = before;
    scene.onAfterRender = after;
    cache = {
      entries,
      detach() {
        if (scene.onBeforeRender === before)
          scene.onBeforeRender = previousBefore;
        if (scene.onAfterRender === after) scene.onAfterRender = previousAfter;
        caches.delete(scene);
      },
    };
    caches.set(scene, cache);
  }
  const entry: Entry = {
    light,
    getCamera,
    revision: 1,
    rendered: 0,
    drawing: 0,
  };
  cache.entries.add(entry);
  const previousAutoUpdate = light.shadow.autoUpdate;
  const previousNeedsUpdate = light.shadow.needsUpdate;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = false;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    cache.entries.delete(entry);
    light.shadow.autoUpdate = previousAutoUpdate;
    light.shadow.needsUpdate = previousNeedsUpdate;
    if (cache.entries.size === 0) cache.detach();
  };
}
