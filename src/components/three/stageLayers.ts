import { Mesh } from "three";
import type { Camera, Object3D } from "three";

const STAGE_GEOMETRY_LAYER = 2;
const CABIN_GEOMETRY_LAYER = 3;

/** The view sees the stage; default-layer shadow cameras only see the vehicle. */
export function configureStageLayers(stage: Object3D, camera: Camera) {
  camera.layers.enable(STAGE_GEOMETRY_LAYER);
  stage.traverse((object) => {
    if (object instanceof Mesh) object.layers.set(STAGE_GEOMETRY_LAYER);
  });
}

/**
 * ContactShadows uses a regular layer-0 override-material render, so it does
 * not honor castShadow=false. Keep optional cabin geometry out of that cached
 * depth capture regardless of whether it loads before or after the venue.
 * The main view (and water reflection, which copies its mask) still sees it.
 */
export function configureCabinLayers(cabin: Object3D, camera: Camera) {
  camera.layers.enable(CABIN_GEOMETRY_LAYER);
  cabin.traverse((object) => {
    if (object instanceof Mesh) object.layers.set(CABIN_GEOMETRY_LAYER);
  });
}
