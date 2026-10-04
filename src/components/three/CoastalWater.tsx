import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
} from "three";
import type { Camera, Vector4 } from "three";
import { createCoastalOceanGeometry } from "./coastalGeometry";
import { Reflector } from "three/addons/objects/Reflector.js";

/** Original seeded height-field derivatives; no image or browser dependency. */
export function createCoastalWaterNormals(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  // Periodic, smoothly interpolated height noise produces irregular short
  // crests. A few strong sine waves instead make ruler-like Fresnel bands.
  const octaves = [
    [8, 0.04, 317],
    [16, 0.018, 923],
    [32, 0.008, 1777],
  ];
  const fields = octaves.map(([cells, amplitude, seed]) => {
    const gradients = new Float32Array(cells * cells * 2);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        const angle =
          (((value ^ (value >>> 16)) >>> 0) / 0xffffffff) * Math.PI * 2;
        const index = (y * cells + x) * 2;
        gradients[index] = Math.cos(angle);
        gradients[index + 1] = Math.sin(angle);
      }
    }
    return { cells, amplitude, gradients };
  });
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const derivative = (t: number) => 30 * t * t * (t - 1) * (t - 1);
  const normal = new Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const { cells, amplitude, gradients } of fields) {
        const u = (x / size) * cells,
          v = (y / size) * cells;
        const ix = Math.floor(u),
          iy = Math.floor(v);
        const fx = u - ix,
          fy = v - iy;
        const a = (iy * cells + ix) * 2;
        const b = (iy * cells + ((ix + 1) % cells)) * 2;
        const c = (((iy + 1) % cells) * cells + ix) * 2;
        const d = (((iy + 1) % cells) * cells + ((ix + 1) % cells)) * 2;
        const ha = gradients[a] * fx + gradients[a + 1] * fy;
        const hb = gradients[b] * (fx - 1) + gradients[b + 1] * fy;
        const hc = gradients[c] * fx + gradients[c + 1] * (fy - 1);
        const hd = gradients[d] * (fx - 1) + gradients[d + 1] * (fy - 1);
        const sx = fade(fx),
          sy = fade(fy);
        // Differentiate gradient noise analytically. Unlike value-noise
        // derivatives, these slopes do not collapse to zero on lattice lines.
        dx +=
          mix(
            mix(gradients[a], gradients[b], sx) + (hb - ha) * derivative(fx),
            mix(gradients[c], gradients[d], sx) + (hd - hc) * derivative(fx),
            sy,
          ) * amplitude;
        dy +=
          (mix(
            mix(gradients[a + 1], gradients[b + 1], sx),
            mix(gradients[c + 1], gradients[d + 1], sx),
            sy,
          ) +
            (mix(hc, hd, sx) - mix(ha, hb, sx)) * derivative(fy)) *
          amplitude;
      }
      normal.set(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(
    data,
    size,
    size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = "original-coastal-wave-normals";
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const waterShader = {
  name: "CoastalWaterShader",
  uniforms: UniformsUtils.merge([
    UniformsLib.fog,
    {
      // Reflector owns these three standard uniforms.
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      normalSampler: { value: null },
      eye: { value: new Vector3() },
      sunDirection: { value: new Vector3(41.56, 55.73, 28.14).normalize() },
      sunColor: { value: new Color("#fff7e8") },
      waterColor: { value: new Color("#164b57") },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 reflectionCoord;
    varying vec3 worldPosition;
    #include <common>
    #include <fog_pars_vertex>
    #include <logdepthbuf_pars_vertex>

    void main() {
      reflectionCoord = textureMatrix * vec4(position, 1.0);
      worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D normalSampler;
    uniform vec3 eye;
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform vec3 waterColor;
    varying vec4 reflectionCoord;
    varying vec3 worldPosition;
    #include <common>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>

    void main() {
      #include <logdepthbuf_fragment>
      vec3 toEye = eye - worldPosition;
      float distanceToEye = length(toEye);
      vec3 viewDirection = normalize(toEye);
      vec2 uv = worldPosition.xz;
      // Each tile contains many unrelated small crests, rather than one swell.
      vec2 broadRipples = texture2D(normalSampler, uv / 17.0).rg * 2.0 - 1.0;
      vec2 crossRipples = texture2D(normalSampler,
        mat2(0.8, -0.6, 0.6, 0.8) * uv / 7.3 + vec2(0.37, 0.13)).rg * 2.0 - 1.0;
      vec2 ripples = texture2D(normalSampler, uv / 2.9 + vec2(0.17, 0.63)).rg * 2.0 - 1.0;
      // Mipmaps plus distance damping keep the low-angle horizon from sparkling.
      float rippleWeight = mix(0.12, 0.02, smoothstep(25.0, 180.0, distanceToEye));
      vec2 slope = broadRipples * 0.72 + crossRipples * 0.4 + ripples * rippleWeight;
      vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));

      vec2 projectedUv = reflectionCoord.xy / reflectionCoord.w;
      vec2 distortion = normal.xz * (0.012 + 0.12 / (1.0 + distanceToEye));
      vec3 reflected = texture2D(tDiffuse,
        clamp(projectedUv + distortion, vec2(0.002), vec2(0.998))).rgb;
      float facing = clamp(dot(viewDirection, normal), 0.0, 1.0);
      // Schlick Fresnel with the air/water normal-incidence reflectance.
      float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
      float sunlight = max(dot(normal, sunDirection), 0.0);
      vec3 body = waterColor * (0.55 + 0.45 * sunlight);
      float glint = pow(max(dot(reflect(-sunDirection, normal), viewDirection), 0.0), 180.0);
      vec3 outgoingLight = mix(body, reflected, fresnel) + sunColor * glint * 1.8;
      gl_FragColor = vec4(outgoingLight, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
};

/**
 * Three r180 Water hides its reflection camera and has no render-target disposal
 * API. Reflector provides those public lifecycle hooks, with the original water
 * shader above supplying Fresnel, metre-scaled waves and aligned sun highlights.
 */
export function createCoastalWater(reflectionResolution: 256 | 512 = 512) {
  const geometry = createCoastalOceanGeometry();
  const normalTexture = createCoastalWaterNormals();
  const water = new Reflector(geometry, {
    textureWidth: reflectionResolution,
    textureHeight: reflectionResolution,
    multisample: 0,
    clipBias: 0.003,
    shader: waterShader,
  });
  water.name = "coastal-water";
  water.position.set(-650, -1.8, 0);
  water.rotation.x = -Math.PI / 2;
  water.layers.set(2);
  const material = water.material as ShaderMaterial;
  // Grazing-angle Fresnel already converges to this direction's real HDR horizon.
  // A constant scene-fog colour would overwrite that with a visible blue band.
  material.fog = false;
  material.uniforms.normalSampler.value = normalTexture;
  const renderReflection = water.onBeforeRender;
  let reflecting = false;
  let disposed = false;
  water.onBeforeRender = function (renderer, scene, camera, ...args) {
    if (disposed || reflecting || camera === water.camera) return;
    // StageGeometry isolates stage meshes on layer 2; the reflection must see
    // exactly what the active view sees, including the car on layer 0.
    water.camera.layers.mask = camera.layers.mask;
    material.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
    const visible = water.visible;
    const previousTarget = renderer.getRenderTarget();
    const xrEnabled = renderer.xr.enabled;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    reflecting = true;
    try {
      // Reflector hides this mesh while rendering; the guard also prevents a
      // nested reflection callback from starting another reflection pass.
      renderReflection.call(water, renderer, scene, camera, ...args);
    } finally {
      water.visible = visible;
      renderer.xr.enabled = xrEnabled;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      if (renderer.getRenderTarget() !== previousTarget) {
        renderer.setRenderTarget(previousTarget);
        const viewport = (camera as Camera & { viewport?: Vector4 }).viewport;
        if (viewport) renderer.state.viewport(viewport);
      }
      reflecting = false;
    }
  };
  return {
    water,
    normalTexture,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Reflector owns its material and target, but not geometry or samplers.
      water.dispose();
      geometry.dispose();
      normalTexture.dispose();
    },
  };
}

/**
 * Mount in the visible StageGeometry only. Keep the inexpensive venue ocean in
 * the separate, one-frame vehicle Environment capture; never clone this object
 * into that cube capture. There is no animation loop or per-frame invalidation.
 */
export function CoastalWater({
  reflectionResolution = 512,
}: {
  reflectionResolution?: 256 | 512;
}) {
  const group = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const parent = group.current;
    if (!parent) return;
    // Allocate in the effect so StrictMode's setup/cleanup/setup cycle creates
    // a fresh live reflector rather than reusing a disposed memoized instance.
    const resources = createCoastalWater(reflectionResolution);
    parent.add(resources.water);
    invalidate();
    return () => {
      parent.remove(resources.water);
      resources.dispose();
    };
  }, [reflectionResolution, invalidate]);
  return <group ref={group} name="coastal-water-surface" dispose={null} />;
}
