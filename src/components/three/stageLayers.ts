import { Mesh } from "three";
import type { Camera, Object3D } from "three";

const STAGE_GEOMETRY_LAYER = 2;

/** The view sees the stage; default-layer shadow cameras only see the vehicle. */
export function configureStageLayers(stage: Object3D, camera: Camera) {
  camera.layers.enable(STAGE_GEOMETRY_LAYER);
  stage.traverse((object) => {
    if (object instanceof Mesh) object.layers.set(STAGE_GEOMETRY_LAYER);
  });
}
