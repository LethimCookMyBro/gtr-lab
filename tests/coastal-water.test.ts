import { describe, expect, it } from "vitest";
import {
  Color,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from "three";
import type { WebGLRenderer } from "three";
import {
  createCoastalWater,
  createCoastalWaterNormals,
} from "../src/components/three/CoastalWater";
import { configureStageLayers } from "../src/components/three/stageLayers";

describe("reflective coastal water", () => {
  it("creates repeatable, mipmapped original normal data with meaningful slopes", () => {
    const texture = createCoastalWaterNormals();
    const repeated = createCoastalWaterNormals();
    const { data, width, height } = texture.image;
    expect([width, height]).toEqual([128, 128]);
    expect(data).toEqual(repeated.image.data);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(NoColorSpace);
    const slopes = [];
    for (let i = 0; i < data.length; i += 4) {
      const normal = new Vector3(
        (data[i] / 255) * 2 - 1,
        (data[i + 1] / 255) * 2 - 1,
        (data[i + 2] / 255) * 2 - 1,
      );
      expect(normal.length()).toBeCloseTo(1, 1);
      expect(normal.z).toBeGreaterThan(0.85);
      expect(data[i + 3]).toBe(255);
      slopes.push(normal.x);
    }
    expect(Math.max(...slopes) - Math.min(...slopes)).toBeGreaterThan(0.08);
    texture.dispose();
    repeated.dispose();
  });

  it("spreads calm ripple energy across irregular features instead of one long wave", () => {
    const texture = createCoastalWaterNormals();
    const { data, width, height } = texture.image;
    const count = width * height;
    let energy = 0;
    const slopes = Array.from({ length: count }, (_, index) => {
      const x = (data[index * 4] / 255) * 2 - 1;
      const y = (data[index * 4 + 1] / 255) * 2 - 1;
      energy += x * x + y * y;
      return [x, y];
    });
    energy /= count;
    let strongestWave = 0;
    // Detect directional crests even when their phases or orientations change.
    // A single dominating wave becomes regular Fresnel bands at grazing angles.
    for (let ky = 0; ky <= 8; ky++) {
      for (let kx = -8; kx <= 8; kx++) {
        if (ky === 0 && kx <= 0) continue;
        let cx = 0,
          sx = 0,
          cy = 0,
          sy = 0;
        slopes.forEach(([x, y], index) => {
          const phase =
            2 *
            Math.PI *
            (((index % width) * kx) / width +
              (Math.floor(index / width) * ky) / height);
          const cosine = Math.cos(phase),
            sine = Math.sin(phase);
          cx += x * cosine;
          sx += x * sine;
          cy += y * cosine;
          sy += y * sine;
        });
        strongestWave = Math.max(
          strongestWave,
          (2 * (cx * cx + sx * sx + cy * cy + sy * sy)) / (count * count),
        );
      }
    }
    expect(strongestWave / energy).toBeLessThan(0.15);
    expect(Math.sqrt(energy)).toBeGreaterThan(0.02);
    expect(Math.sqrt(energy)).toBeLessThan(0.06);
    // A height interpolation with zero lattice derivatives would still produce
    // regularly spaced flat lines. Ripple slopes must survive across tile axes.
    for (let axis = 0; axis < 2; axis++) {
      let axisEnergy = 0;
      for (let index = 0; index < width; index++) {
        const normal = slopes[axis === 0 ? index * width : index];
        axisEnergy += normal[axis] * normal[axis];
      }
      expect(axisEnergy / width).toBeGreaterThan(energy * 0.15);
    }
    texture.dispose();
  });

  it("owns a correctly placed real reflection surface and bounded render target", () => {
    const { water, normalTexture, dispose } = createCoastalWater(256);
    const material = water.material as ShaderMaterial;
    const target = water.getRenderTarget();
    expect(water.name).toBe("coastal-water");
    expect(water.position.toArray()).toEqual([-650, -1.8, 0]);
    expect(water.rotation.x).toBe(-Math.PI / 2);
    water.geometry.computeBoundingBox();
    const size = water.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1717.35, 3);
    expect([size.y, size.z]).toEqual([1400, 0]);
    expect([target.width, target.height, target.samples]).toEqual([
      256, 256, 0,
    ]);
    expect(material.uniforms.normalSampler.value).toBe(normalTexture);
    expect(material.uniforms.tDiffuse.value).toBe(target.texture);
    expect(material.uniforms.sunDirection.value.toArray()).toEqual(
      new Vector3(41.56, 55.73, 28.14).normalize().toArray(),
    );
    expect(material.uniforms.waterColor.value).toBeInstanceOf(Color);
    expect(material.fog).toBe(false);
    expect(water.layers.mask).toBe(1 << 2);
    dispose();
  });

  it.each([false, true])(
    "preserves layers and renderer state, including reflection failure: %s",
    (failFirst) => {
      const resources = createCoastalWater();
      const { water } = resources;
      const stage = new Group();
      const scene = new Scene();
      const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
      stage.add(water);
      scene.add(stage);
      camera.position.set(0, 4, 12);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      configureStageLayers(stage, camera);
      scene.updateMatrixWorld(true);
      const originalTarget = new WebGLRenderTarget(16, 16);
      let currentTarget: WebGLRenderTarget | null = originalTarget;
      let reflections = 0;
      const renderer = {
        xr: { enabled: true },
        shadowMap: { autoUpdate: true },
        autoClear: true,
        getRenderTarget: () => currentTarget,
        setRenderTarget: (target: WebGLRenderTarget | null) => {
          currentTarget = target;
        },
        state: { buffers: { depth: { setMask: () => {} } } },
        render: (reflectedScene: Scene, reflectedCamera: PerspectiveCamera) => {
          reflections++;
          expect(reflectedScene).toBe(scene);
          expect(reflectedCamera.layers.mask).toBe(camera.layers.mask);
          expect(reflectedCamera.layers.mask).toBe(5);
          expect(water.visible).toBe(false);
          expect(currentTarget).toBe(water.getRenderTarget());
          water.onBeforeRender(
            renderer as unknown as WebGLRenderer,
            scene,
            reflectedCamera,
            water.geometry,
            water.material as ShaderMaterial,
            stage,
          );
          if (failFirst) throw new Error("reflection failed");
        },
      };
      const reflect = () =>
        water.onBeforeRender(
          renderer as unknown as WebGLRenderer,
          scene,
          camera,
          water.geometry,
          water.material as ShaderMaterial,
          stage,
        );
      if (failFirst) expect(reflect).toThrow("reflection failed");
      else reflect();
      expect(reflections).toBe(1);
      expect(currentTarget).toBe(originalTarget);
      expect(water.visible).toBe(true);
      expect(renderer.xr.enabled).toBe(true);
      expect(renderer.shadowMap.autoUpdate).toBe(true);
      expect(
        (water.material as ShaderMaterial).uniforms.eye.value.toArray(),
      ).toEqual(camera.position.toArray());
      // The recursion guard must be released even after a failed render.
      failFirst = false;
      reflect();
      expect(reflections).toBe(2);
      resources.dispose();
      originalTarget.dispose();
    },
  );

  it("disposes every exclusively owned GPU resource exactly once", () => {
    const { water, normalTexture, dispose } = createCoastalWater();
    const resources = [
      water.geometry,
      water.material as ShaderMaterial,
      normalTexture,
      water.getRenderTarget(),
    ];
    const disposals = resources.map(() => 0);
    resources.forEach((resource, index) => {
      resource.addEventListener("dispose", () => disposals[index]++);
    });
    dispose();
    dispose();
    expect(disposals).toEqual([1, 1, 1, 1]);
  });
});
