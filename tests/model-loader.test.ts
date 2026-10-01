import { expect, it } from "vitest";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createVehicleLoader } from "../src/components/three/createVehicleLoader";
it("registers the bundled local meshopt decoder for compressed production GLBs", async () => {
  await MeshoptDecoder.ready;
  const loader = createVehicleLoader();
  expect(loader.meshoptDecoder).toBe(MeshoptDecoder);
  expect(MeshoptDecoder.supported).toBe(true);
});
