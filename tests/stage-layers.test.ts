import { describe, expect, it } from "vitest";
import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
  OrthographicCamera,
} from "three";
import {
  configureCabinLayers,
  configureStageLayers,
} from "../src/components/three/stageLayers";

describe("contact-shadow isolation", () => {
  it("isolates nested cabin meshes before any venue mount and preserves other camera layers", () => {
    const cabin = new Group(),
      nested = new Group();
    const mesh = new Mesh(new PlaneGeometry(2, 4), new MeshBasicMaterial());
    nested.add(mesh);
    cabin.add(nested);
    const main = new PerspectiveCamera();
    main.layers.enable(5);
    const contact = new OrthographicCamera();
    const directional = new OrthographicCamera();
    directional.layers.enable(2);
    configureCabinLayers(cabin, main);
    configureCabinLayers(cabin, main);
    expect(main.layers.mask).toBe((1 << 0) | (1 << 3) | (1 << 5));
    expect(main.layers.test(mesh.layers)).toBe(true);
    expect(contact.layers.test(mesh.layers)).toBe(false);
    expect(directional.layers.test(mesh.layers)).toBe(false);
    expect(contact.layers.mask).toBe(1);
    expect(directional.layers.mask).toBe(5);
    const replacementCamera = new PerspectiveCamera();
    configureCabinLayers(cabin, replacementCamera);
    expect(replacementCamera.layers.test(mesh.layers)).toBe(true);
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  });
  it("keeps stage floors and panorama geometry out of shadow depth captures", () => {
    const stage = new Group();
    const floor = new Mesh(
      new PlaneGeometry(150, 150),
      new MeshBasicMaterial(),
    );
    const panorama = new Mesh(
      new PlaneGeometry(80, 80),
      new MeshBasicMaterial(),
    );
    const contactGroup = new Group();
    const receiver = new Mesh(
      new PlaneGeometry(12, 12),
      new MeshBasicMaterial(),
    );
    const shadowCamera = new OrthographicCamera();
    contactGroup.add(receiver, shadowCamera);
    stage.add(floor, panorama, contactGroup);
    const camera = new PerspectiveCamera();
    const vehicle = new Mesh(new PlaneGeometry(2, 4), new MeshBasicMaterial());
    const blurPlane = new Mesh(
      new PlaneGeometry(12, 12),
      new MeshBasicMaterial(),
    );
    configureStageLayers(stage, camera);
    for (const mesh of [floor, panorama, receiver]) {
      expect(camera.layers.test(mesh.layers)).toBe(true);
      expect(shadowCamera.layers.test(mesh.layers)).toBe(false);
    }
    expect(camera.layers.test(vehicle.layers)).toBe(true);
    expect(shadowCamera.layers.test(vehicle.layers)).toBe(true);
    expect(shadowCamera.layers.test(blurPlane.layers)).toBe(true);
  });
});
