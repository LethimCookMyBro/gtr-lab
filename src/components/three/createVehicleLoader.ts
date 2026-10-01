import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Bundled decoder keeps compressed assets functional under the self-only CSP. */
export function createVehicleLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
