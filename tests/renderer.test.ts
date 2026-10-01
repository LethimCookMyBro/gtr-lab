import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  Texture,
} from "three";
import {
  CAMERA_VIEWS,
  cameraView,
  normalizeBounds,
  materialRole,
  interpolationAlpha,
  progressPercent,
} from "../src/components/three/sceneHelpers";
import {
  prepareVehicle,
  applyVehicleAppearance,
  vehicleCapabilities,
} from "../src/components/three/materialAdapter";

const roles = {
  paint: ["BodyPaint"],
  headlights: ["Headlamp"],
  taillights: ["TailLamp"],
};

describe("vehicle coordinate and camera contract", () => {
  it("centers and grounds bounds at an exact 4.7m horizontal extent", () => {
    const result = normalizeBounds({ min: [-2, -1, -5], max: [4, 2, 5] });
    expect(result.scale).toBeCloseTo(0.47);
    expect(result.position[0]).toBeCloseTo(-0.47);
    expect(result.position[1]).toBeCloseTo(0.47);
    expect(result.position[2]).toBe(-0);
  });
  it("rejects empty, nonfinite, and inverted bounds", () => {
    expect(() => normalizeBounds({ min: [0, 0, 0], max: [0, 0, 0] })).toThrow();
    expect(() =>
      normalizeBounds({ min: [0, 0, 0], max: [Infinity, 2, 4] }),
    ).toThrow();
    expect(() => normalizeBounds({ min: [3, 0, 0], max: [2, 1, 4] })).toThrow();
  });
  it("has the eight required unique views and a safe unknown fallback", () => {
    expect(Object.keys(CAMERA_VIEWS)).toEqual([
      "hero",
      "front",
      "side",
      "rear-quarter",
      "rear",
      "wheel",
      "interior",
      "top",
    ]);
    expect(cameraView("missing")).toBe(CAMERA_VIEWS.hero);
    expect(
      new Set(
        Object.values(CAMERA_VIEWS).map((view) => view.position.join(",")),
      ).size,
    ).toBe(8);
    expect(CAMERA_VIEWS.interior.minDistance).toBeLessThan(1);
  });
  it("uses an instant transition for reduced motion and bounded delta smoothing", () => {
    expect(interpolationAlpha(0.016, true)).toBe(1);
    expect(interpolationAlpha(0.016, false)).toBeGreaterThan(0);
    expect(interpolationAlpha(0.016, false)).toBeLessThan(1);
    expect(interpolationAlpha(1, false)).toBe(interpolationAlpha(0.1, false));
  });
  it("never invents progress when byte totals are unavailable", () => {
    expect(progressPercent(500, 0)).toBe(0);
    expect(progressPercent(500, 1000)).toBe(50);
    expect(progressPercent(1000, 1000)).toBe(99);
  });
});

describe("declared material roles", () => {
  it("only matches exact declared names rather than guessing paint or glass", () => {
    expect(materialRole("BodyPaint", "Car", roles)).toBe("paint");
    expect(materialRole("WindowGlass", "Car", roles)).toBeNull();
    expect(materialRole("bodypaint", "Car", roles)).toBeNull();
    expect(materialRole("BodyPaint.001", "Car", roles)).toBeNull();
    expect(
      materialRole("Anything", "ExplicitPanel", {
        ...roles,
        paint: ["ExplicitPanel"],
      }),
    ).toBe("paint");
  });
  it("clones shared materials and preserves nonpaint materials", () => {
    const root = new Group();
    const glass = new MeshPhysicalMaterial({
      color: "#888888",
      transmission: 0.8,
      roughness: 0.12,
    });
    glass.name = "WindowGlass";
    const body = new MeshStandardMaterial({ color: "#555555" });
    body.name = "BodyPaint";
    root.add(
      new Mesh(new BoxGeometry(2, 1, 4), body),
      new Mesh(new BoxGeometry(1, 0.5, 1), glass),
    );
    const prepared = prepareVehicle(root, roles);
    applyVehicleAppearance(prepared.bindings, "#ff0000", false);
    const bodyCopy = (prepared.scene.children[0] as Mesh)
      .material as MeshPhysicalMaterial;
    const glassCopy = (prepared.scene.children[1] as Mesh)
      .material as MeshPhysicalMaterial;
    expect(vehicleCapabilities(prepared.bindings)).toEqual({
      paint: true,
      lights: false,
    });
    expect(bodyCopy.isMeshPhysicalMaterial).toBe(true);
    expect(bodyCopy.clearcoat).toBe(1);
    expect(bodyCopy.color.getHexString()).toBe("ff0000");
    expect(body.color.getHexString()).toBe("555555");
    expect(glassCopy.transmission).toBe(0.8);
    expect(glassCopy.color.getHexString()).toBe("888888");
    expect(glassCopy).not.toBe(glass);
    prepared.dispose();
  });
  it("only toggles declared emitters and disposes owned shared resources once", () => {
    const root = new Group();
    const mat = new MeshStandardMaterial({ map: new Texture() });
    mat.name = "Headlamp";
    const geometry = new BoxGeometry(2, 1, 4);
    root.add(new Mesh(geometry, mat), new Mesh(geometry, mat));
    const prepared = prepareVehicle(root, roles);
    const emitter = (prepared.scene.children[0] as Mesh)
      .material as MeshStandardMaterial;
    applyVehicleAppearance(prepared.bindings, "#ff0000", true);
    expect(vehicleCapabilities(prepared.bindings)).toEqual({
      paint: false,
      lights: true,
    });
    expect(emitter.emissiveIntensity).toBeGreaterThan(0);
    applyVehicleAppearance(prepared.bindings, "#ff0000", false);
    expect(emitter.emissiveIntensity).toBe(0);
    let geometryDisposals = 0;
    let textureDisposals = 0;
    geometry.addEventListener("dispose", () => geometryDisposals++);
    mat.map!.addEventListener("dispose", () => textureDisposals++);
    prepared.dispose();
    prepared.dispose();
    expect(geometryDisposals).toBe(1);
    expect(textureDisposals).toBe(1);
  });
});

describe("interior and outdoor contracts", () => {
  it("uses local licensed HDRI paths and low-resolution mobile variants", async () => {
    const { environmentAsset } =
      await import("../src/components/three/sceneHelpers");
    expect(environmentAsset("forest", false)).toBe(
      "/environments/tief_etz.hdr",
    );
    expect(environmentAsset("coast", true)).toBe(
      "/environments/victoria_curve_01_1k.hdr",
    );
    expect(environmentAsset("studio", false)).toBeNull();
  });
  it("looks around a fixed seat without translating the camera", async () => {
    const { interiorLookTarget } =
      await import("../src/components/three/sceneHelpers");
    const origin: [number, number, number] = [0.35, 1.05, -0.16];
    const forward = interiorLookTarget(origin, 0, 0);
    expect(forward[0]).toBe(origin[0]);
    expect(forward[1]).toBe(origin[1]);
    expect(forward[2]).toBeCloseTo(origin[2] + 1);
    const passenger = interiorLookTarget(origin, Math.PI / 2, 0);
    expect(passenger[0]).toBeCloseTo(origin[0] + 1);
    expect(passenger[2]).toBeCloseTo(origin[2]);
    expect(origin).toEqual([0.35, 1.05, -0.16]);
  });
});

describe("review regressions", () => {
  it("interpolates paint per frame while preserving clearcoat and lights", async () => {
    const { stepVehicleAppearance } =
      await import("../src/components/three/materialAdapter");
    const root = new Group();
    const material = new MeshStandardMaterial({ color: "#000000" });
    material.name = "BodyPaint";
    root.add(new Mesh(new BoxGeometry(2, 1, 4), material));
    const prepared = prepareVehicle(root, roles);
    const paint = (prepared.scene.children[0] as Mesh)
      .material as MeshPhysicalMaterial;
    const complete = stepVehicleAppearance(
      prepared.bindings,
      "#ffffff",
      true,
      0.016,
      false,
    );
    expect(complete).toBe(false);
    expect(paint.color.r).toBeGreaterThan(0);
    expect(paint.color.r).toBeLessThan(1);
    expect(paint.clearcoat).toBe(1);
    expect(paint.metalness).toBe(0.78);
    for (let frame = 0; frame < 180; frame++)
      stepVehicleAppearance(prepared.bindings, "#ffffff", true, 0.016, false);
    expect(paint.color.getHexString()).toBe("ffffff");
    expect(
      stepVehicleAppearance(prepared.bindings, "#ff0000", false, 0.016, true),
    ).toBe(true);
    expect(paint.color.getHexString()).toBe("ff0000");
    prepared.dispose();
  });
  it.each(Object.entries(CAMERA_VIEWS))(
    "keeps the %s camera inside orbit limits so interpolation can settle",
    async (_name, view) => {
      const { PerspectiveCamera, Vector3 } = await import("three");
      const { OrbitControls } = await import("three-stdlib");
      const camera = new PerspectiveCamera();
      const orbit = new OrbitControls(camera);
      orbit.minPolarAngle = 0.005;
      orbit.maxPolarAngle = Math.PI / 2 - 0.025;
      const destination = new Vector3(...view.position);
      orbit.target.set(...view.target);
      orbit.minDistance = view.minDistance;
      orbit.maxDistance = view.maxDistance;
      for (let frame = 0; frame < 600; frame++) {
        camera.position.lerp(destination, interpolationAlpha(1 / 60, false));
        orbit.update();
      }
      expect(camera.position.distanceToSquared(destination)).toBeLessThan(
        0.00001,
      );
      orbit.dispose();
    },
  );
});

describe("owned image and capability safety", () => {
  it("closes shared owned ImageBitmaps exactly once", () => {
    let closes = 0;
    class TestImageBitmap {
      close() {
        closes++;
      }
    }
    vi.stubGlobal("ImageBitmap", TestImageBitmap);
    try {
      const image = new TestImageBitmap();
      const first = new Texture(image as unknown as TexImageSource);
      const second = new Texture(image as unknown as TexImageSource);
      const material = new MeshStandardMaterial({
        map: first,
        normalMap: second,
      });
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(2, 1, 4), material));
      const prepared = prepareVehicle(root, roles);
      prepared.dispose();
      prepared.dispose();
      expect(closes).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("derives enabled controls from matched PBR bindings rather than declarations", async () => {
    const { vehicleCapabilities } =
      await import("../src/components/three/materialAdapter");
    const root = new Group();
    const material = new MeshStandardMaterial();
    material.name = "Unmatched";
    root.add(new Mesh(new BoxGeometry(2, 1, 4), material));
    const prepared = prepareVehicle(root, roles);
    expect(vehicleCapabilities(prepared.bindings)).toEqual({
      paint: false,
      lights: false,
    });
    prepared.dispose();
  });
});
