import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshPhysicalMaterial, Texture } from "three";
import { prepareVehicle } from "../src/components/three/materialAdapter";
import { cabinCameraView } from "../src/components/three/cabinPreview";
import { getModel } from "../src/data/models";

it("preserves one authored whole-car scene, material identities, flags and exactly-once disposal", () => {
  const source = new Group(),
    map = new Texture();
  const material = new MeshPhysicalMaterial({
    map,
    transmission: 0.3,
    opacity: 0.41,
    transparent: true,
    roughness: 0.17,
  });
  const mesh = new Mesh(new BoxGeometry(2, 1, 4), material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.layers.set(3);
  mesh.renderOrder = 7;
  source.add(mesh);
  const materialDispose = vi.spyOn(material, "dispose"),
    textureDispose = vi.spyOn(map, "dispose"),
    geometryDispose = vi.spyOn(mesh.geometry, "dispose");
  const asset = prepareVehicle(
    source,
    { paint: [], headlights: [], taillights: [] },
    [],
    false,
    true,
  );
  expect(asset.scene).toBe(source);
  expect(mesh.material).toBe(material);
  expect([
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.layers.mask,
    mesh.renderOrder,
  ]).toEqual([false, true, 8, 7]);
  expect(asset.bindings).toEqual([]);
  asset.dispose();
  asset.dispose();
  expect(materialDispose).toHaveBeenCalledTimes(1);
  expect(textureDispose).toHaveBeenCalledTimes(1);
  expect(geometryDispose).toHaveBeenCalledTimes(1);
});

it("resolves the optional study without changing any catalog model or supplying later Premium specifications", async () => {
  const module = await import("../src/data/r35IntegratedStudy").catch(
    () => ({}),
  );
  expect(module).toHaveProperty("getConfiguratorModel");
  const { getConfiguratorModel, R35_STUDY } =
    module as typeof import("../src/data/r35IntegratedStudy");
  expect(getConfiguratorModel("premium", false)).toBe(getModel("premium"));
  expect(getConfiguratorModel("nismo", true)).toBe(getModel("nismo"));
  const selected = getConfiguratorModel("premium", true)!;
  expect(selected).toBe(R35_STUDY);
  expect(selected.modelYear).toBe(
    "2008 artist model · factory specifications unverified",
  );
  expect(selected.powerValue).toBeNull();
  expect(selected.torqueValue).toBeNull();
  expect(selected.image).toBeNull();
  expect(selected.asset.materialRoles).toEqual({
    paint: [],
    headlights: [],
    taillights: [],
  });
  expect(selected.asset.cabinLayout?.kind).toBe("integrated");
  expect(getModel("premium")!.asset.url).toBe("/models/ciasny-r35.glb");
});

it("transforms source-world inspection anchors exactly once using the loaded whole-car normalization", () => {
  const view = cabinCameraView(
    "driver",
    { scale: 2, position: [1, 2, 3] },
    {
      driver: {
        position: [-1.79, 0.8, 0.55],
        target: [-2, 0.4, 1.38],
        fov: 72,
      },
      passenger: {
        position: [-2.49, 0.8, 0.55],
        target: [-2.25, 0.4, 1.38],
        fov: 72,
      },
      rear: {
        position: [-1.79, 0.8, -0.28],
        target: [-2.08, 0.48, 1.22],
        fov: 78,
      },
    },
  );
  expect(view.position).toEqual([-2.58, 3.6, 4.1]);
  expect(view.target).toEqual([-3, 2.8, 5.76]);
  expect(view.near).toBe(0.03);
});
