import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
} from "three";
import type { Camera, Vector4 } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

/** Original periodic wave field; no image download or canvas/browser dependency. */
export function createCoastalWaterNormals(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  // Integer frequencies tile seamlessly. Slopes, rather than random RGB noise,
  // make a coherent normal field with broad swell and finer wind-driven ripples.
  const waves = [
    [1, 2, 0.18, 0.2],
    [3, 1, 0.09, 1.7],
    [-2, 5, 0.06, 2.8],
    [7, 3, 0.03, 0.7],
    [-5, 9, 0.02, 4.1],
    [11, -4, 0.012, 2.3],
  ];
  const normal = new Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, amplitude, phase] of waves) {
        const slope =
          (Math.cos(((x * kx + y * ky) / size) * Math.PI * 2 + phase) *
            amplitude) /
          Math.hypot(kx, ky);
        dx += kx * slope;
        dy += ky * slope;
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
      vec2 swell = texture2D(normalSampler, uv / 53.0).rg * 2.0 - 1.0;
      vec2 crossSwell = texture2D(normalSampler,
        mat2(0.8, -0.6, 0.6, 0.8) * uv / 31.0 + vec2(0.37, 0.13)).rg * 2.0 - 1.0;
      vec2 ripples = texture2D(normalSampler, uv / 9.0 + vec2(0.17, 0.63)).rg * 2.0 - 1.0;
      // Mipmaps plus distance damping keep the low-angle horizon from sparkling.
      float rippleWeight = mix(0.32, 0.06, smoothstep(25.0, 180.0, distanceToEye));
      vec2 slope = swell * 0.85 + crossSwell * 0.55 + ripples * rippleWeight;
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
  const geometry = new PlaneGeometry(2000, 1400);
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
  material.fog = true;
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
