import { memo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Color,
  Light,
  RectAreaLight,
  Mesh,
  type Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
  Vector4,
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { models } from "../../data/models";
import { useVehicleAsset } from "../three/useVehicleAsset";
import { applyVehicleAppearance } from "../three/materialAdapter";
import type { PreparedVehicle } from "../three/materialAdapter";
import { StageGeometry } from "../three/StageGeometry";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import { SceneBoundary } from "../three/SceneBoundary";
import type { HomeSceneLoadState } from "./homeReadiness";
import { useRearRenderPreparation } from "./useRearRenderPreparation";
type Props = {
  progress: number;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onProgress: (value: number) => void;
  onLoadState?: (state: HomeSceneLoadState) => void;
  active?: boolean;
};
// One physical strip light moves across the real body; the environment stays cached.
RectAreaLightUniformsLib.init();
const source = models.find((model) => model.id === "premium")!.asset;
const studioBackground = new Color("#030405");

// r180's LTC area-light approximation drives grazing specular toward white
// independently of MeshPhysicalMaterial.specularIntensity. Restrict that direct
// term on smoked glass/matte floor; retain their environment and diffuse terms.
function restrainStudioSpecular(
  shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0],
) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_end>",
    "#include <lights_fragment_end>\nreflectedLight.directSpecular *= 0.045;",
  );
}

// Source-local center XY and inner/outer radii measured from the four existing
// Glass.001 annuli. This shades their actual surfaces; it adds no geometry.
const rearLensBands = [
  new Vector4(-0.87364, 0, 0.07259, 0.13009),
  new Vector4(-0.61782, -0.0220954, 0.05168, 0.10495),
  new Vector4(0.61782, -0.0220954, 0.05168, 0.10495),
  new Vector4(0.87364, 0, 0.07259, 0.13009),
];
function gradeRearLens(
  shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0],
) {
  shader.uniforms.rearLensBands = { value: rearLensBands };
  shader.vertexShader =
    "varying vec2 vRearLensPosition;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvRearLensPosition = position.xy;",
  );
  shader.fragmentShader =
    "varying vec2 vRearLensPosition;\nuniform vec4 rearLensBands[4];\n" +
    shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
     float rearBandDistance = 100.0;
     for (int i = 0; i < 4; i++) {
       vec4 band = rearLensBands[i];
       float radius = length(vRearLensPosition - band.xy);
       float halfWidth = (band.w - band.z) * 0.5;
       rearBandDistance = min(rearBandDistance, abs(radius - (band.z + band.w) * 0.5) / halfWidth);
     }
     float rearCore = exp(-2.4 * rearBandDistance * rearBandDistance);
     totalEmissiveRadiance *= mix(0.1, 1.0, rearCore);
     totalEmissiveRadiance += rearCore * vec3(0.08, 0.035, 0.012);`,
  );
}

function RearCamera({
  progress,
  reducedMotion,
}: Pick<Props, "progress" | "reducedMotion">) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera,
    size = useThree((s) => s.size),
    invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene);
  const target = reducedMotion ? 1 : progress;
  useEffect(() => {
    scene.background = new Color("#000000");
    invalidate();
  }, [target, size.width, size.height, invalidate, scene]);
  useFrame(() => {
    // Browser scroll already supplies RAF-paced positions. Apply one demand frame
    // instead of scheduling a second animation that can backlog on slower GPUs.
    const p = target,
      aspect = size.width / Math.max(1, size.height);
    const t = Math.min(1, Math.max(0, (p - 0.2) / 0.8));
    const reveal = t * t * (3 - 2 * t);
    // The four emissive lenses lead alone. Every incident source and the stage
    // emerge together, reaching the accepted studio only at the end of scroll.
    scene.environmentIntensity = reveal * 0.98;
    if (scene.background instanceof Color)
      scene.background.copy(studioBackground).multiplyScalar(reveal);
    if (scene.fog)
      scene.fog.color.copy(studioBackground).multiplyScalar(reveal);
    const key = scene.getObjectByName("rear-key"),
      fill = scene.getObjectByName("rear-fill"),
      roof = scene.getObjectByName("rear-roof");
    if (key instanceof Light) key.intensity = reveal * 0.968;
    if (fill instanceof Light) fill.intensity = reveal * 0.087;
    if (roof instanceof RectAreaLight) {
      roof.intensity = reveal * 3.4;
      roof.lookAt(0, 1, -1);
    }
    for (let index = 0; index < 4; index++) {
      const spill = scene.getObjectByName(`rear-lens-spill-${index}`);
      if (spill instanceof Light) spill.intensity = reveal * 0.018;
    }
    const sweep = scene.getObjectByName("rear-sweep");
    if (sweep instanceof RectAreaLight) {
      const pass = Math.min(1, Math.max(0, (p - 0.2) / 0.6));
      // This is scroll-bound, never a render loop. Lamps retain the opening beat;
      // the white source crosses the shoulders, then drops toward the exhausts.
      sweep.intensity =
        reducedMotion || pass === 0 || pass === 1
          ? 0
          : Math.sin(pass * Math.PI) * 3.2 * reveal;
      sweep.position.set(-3.8 + pass * 7.6, 2.5 - pass * 2, -4.5);
      sweep.lookAt(0, 1.15 - pass * 0.8, -2.1);
    }
    const desktop = size.width > 700 && size.height > 500;
    const distance = Math.max(
      // Short desktop windows need breathing room for the caption below the tyres.
      desktop ? 3.4 + Math.max(0, 800 - size.height) * 0.004 : 5.3,
      2.12 / (2 * Math.tan(Math.PI / 12) * aspect * 0.86),
    );
    camera.position.set(
      0,
      desktop ? 0.88 : 0.96,
      -2.35 - distance * (desktop ? 1.03 - 0.03 * p : 0.9 + 0.1 * p),
    );
    camera.fov = 30;
    camera.aspect = aspect;
    camera.lookAt(0, desktop ? 0.5 : 0.66, -1.6);
    camera.updateProjectionMatrix();
    gl.domElement.dataset.rearProgress = p.toFixed(4);
  });
  return null;
}
function RearVehicle({ asset }: { asset: PreparedVehicle }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    applyVehicleAppearance(asset.bindings, "#ecebe6", true);
    for (const b of asset.bindings) {
      if (b.role === "paint") {
        b.material.metalness = 0.22;
        b.material.roughness = 0.36;
        if (b.material instanceof MeshPhysicalMaterial) {
          b.material.clearcoat = 0.8;
          b.material.clearcoatRoughness = 0.24;
        }
      }
      if (b.role === "taillights") {
        b.material.emissive.set("#ff1007");
        // These are the source's very thin LED tubes. The broad existing lens
        // annuli below carry the signature, rather than eight wire outlines.
        b.material.emissiveIntensity = 0.14;
        // ACES shifts strong red emitters toward orange. Keep the real LED hue.
        b.material.toneMapped = false;
      }
      if (b.role === "headlights") b.material.emissiveIntensity = 0;
    }
    const satinPaint = asset.bindings.find((b) => b.role === "paint")?.material;
    // Exact meshes/materials verified in the already-public GLB. The Metal
    // material is shared with badges, so only the three lamp housings get copies.
    const housingNames = new Set([
      "Taillights001_Metal_0",
      "Taillights002_Metal_0",
      "Taillights003_Metal_0",
    ]);
    const glassCopies = new Map<MeshStandardMaterial, MeshPhysicalMaterial>();
    asset.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const adapt = (original: Material) => {
        if (!(original instanceof MeshStandardMaterial)) return original;
        let material = original;
        if (
          object.name === "Spoiler_Carbon_Fiber_0" &&
          material.name === "Carbon_Fiber" &&
          satinPaint
        ) {
          // Carbon_Fiber is also used by the rear grille. Replace only the wing,
          // using the configured body finish without inherited surface maps.
          material = satinPaint.clone();
          material.name = "Rear_Satin_Spoiler";
          for (const [key, value] of Object.entries(material))
            if (value instanceof Texture) Reflect.set(material, key, null);
        }
        if (housingNames.has(object.name) && material.name === "Metal") {
          material = material.clone();
          // A stable name makes StrictMode/effect re-entry reuse the owned copy.
          material.name = "Rear_Taillight_Housing";
          material.color.set("#16181c");
          material.metalness = 0.22;
          material.roughness = 0.46;
          material.emissive.set("#000000");
          material.emissiveIntensity = 0;
        }
        if (material.name === "Window_Glass") {
          if (!(material instanceof MeshPhysicalMaterial)) {
            let physical = glassCopies.get(material);
            if (!physical) {
              physical = new MeshPhysicalMaterial();
              MeshStandardMaterial.prototype.copy.call(physical, material);
              Object.assign(physical, {
                defines: { STANDARD: "", PHYSICAL: "" },
              });
              glassCopies.set(material, physical);
            }
            material = physical;
          }
          material.color.set("#080b10");
          material.roughness = 0.14;
          material.metalness = 0;
          material.opacity = 0.94;
          // r180 takes environment intensity from the scene when envMap is null.
          // Physical specular strength actually restrains the white studio card
          // while following the existing scroll-bound environment reveal.
          (material as MeshPhysicalMaterial).specularIntensity = 0.2;
          material.onBeforeCompile = restrainStudioSpecular;
          material.customProgramCacheKey = () => "rear-window-ltc-v1";
          material.needsUpdate = true;
        }
        if (material.name === "Glass.001") {
          // This material covers the four real, broad annular lenses. Their
          // existing holes preserve dark centers; no substitute geometry/glow.
          material.color.set("#35040a");
          material.emissive.set("#ff0905");
          material.emissiveIntensity = 0.92;
          material.opacity = 0.96;
          material.transparent = true;
          material.depthWrite = false;
          material.metalness = 0;
          material.roughness = 0.26;
          material.toneMapped = false;
          material.onBeforeCompile = gradeRearLens;
          material.customProgramCacheKey = () => "rear-lens-profile-v1";
          material.needsUpdate = true;
        }
        if (material.name === "Reverse_Emitter") {
          material.color.set("#343941");
          material.metalness = 0.05;
          material.roughness = 0.4;
          material.emissiveIntensity = 0;
        }
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(adapt)
        : adapt(object.material);
    });
    // Glass replacements retain the maps, which the asset still owns. Dispose
    // only the superseded material; every new material stays on the scene and
    // is reclaimed by the existing idempotent asset disposer.
    glassCopies.forEach((_copy, original) => original.dispose());
    invalidate();
  }, [asset, invalidate]);
  return (
    <group scale={asset.scale} position={asset.position} dispose={null}>
      <primitive object={asset.scene} dispose={null} />
    </group>
  );
}
// Stable children keep Drei's one-shot environment and shadows from rebuilding
// when only the scroll-driven camera and light intensities change.
const RearStudio = memo(function RearStudio() {
  return (
    <>
      <fog attach="fog" args={["#000000", 13, 30]} />
      <StageGeometry>
        <ambientLight name="rear-fill" intensity={0} />
        <directionalLight
          name="rear-key"
          position={[-3, 6, -5]}
          intensity={0}
        />
        {/* A broad overhead source separates the real roof and satin wing
            from black without turning up the frontal body reflections. */}
        <rectAreaLight
          name="rear-roof"
          color="#ffffff"
          width={6}
          height={3}
          intensity={0}
          position={[0, 4, 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
        <rectAreaLight
          name="rear-sweep"
          color="#ffffff"
          width={2.8}
          height={0.45}
          intensity={0}
          position={[-3.8, 2.5, -4.5]}
          rotation={[0, Math.PI, 0]}
        />
        {/* Small local sources suggest lens spill on the surrounding real body. */}
        {[
          [-0.682, 0.872, -2.29],
          [-0.481, 0.855, -2.31],
          [0.486, 0.855, -2.31],
          [0.686, 0.872, -2.29],
        ].map((position, index) => (
          <pointLight
            key={index}
            name={`rear-lens-spill-${index}`}
            position={position as [number, number, number]}
            color="#ff170b"
            intensity={0}
            distance={0.36}
            decay={2}
          />
        ))}
        <Environment resolution={256} frames={1} environmentIntensity={0}>
          <color attach="background" args={["#090a0b"]} />
          <Lightformer
            form="rect"
            intensity={2.6}
            position={[0, 4.5, 1.5]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[7, 4, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.5}
            position={[-4, 2, -1.2]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[1.2, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.5}
            position={[4, 2, -1.2]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[1.2, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.5}
            position={[0, 2.8, -6]}
            scale={[3.8, 0.45, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.65}
            position={[0, 0.4, -4]}
            scale={[3.4, 0.25, 1]}
          />
        </Environment>
        {/* Drei blurs with an unparented plane at world Y=0. Its upward-facing
            camera must stay below zero, with the receiver just above the floor. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <planeGeometry args={[150, 150]} />
          <meshPhysicalMaterial
            color="#17191c"
            roughness={0.96}
            metalness={0}
            specularIntensity={0.08}
            onBeforeCompile={restrainStudioSpecular}
            customProgramCacheKey={() => "rear-floor-ltc-v1"}
          />
        </mesh>
        <ContactShadows
          position={[0, -0.001, 0]}
          opacity={0.9}
          scale={[3.2, 5.6]}
          blur={0.42}
          far={0.35}
          resolution={512}
          frames={1}
          color="#000000"
        />
      </StageGeometry>
    </>
  );
});

function ContextHealth({ onError }: Pick<Props, "onError">) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      onError("The 3D connection was interrupted.");
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onError]);
  return null;
}
function RearRenderPreparation({
  onReady,
  onError,
}: Pick<Props, "onReady" | "onError">) {
  useRearRenderPreparation(onReady, onError);
  return null;
}

/** Uses only the already-published Ciasny asset; this owns and disposes its load. */
export default function RearVehicleScene(props: Props) {
  const asset = useVehicleAsset(
    source.url!,
    source.materialRoles,
    props.onProgress,
    props.onError,
    source.disabledEmissive,
    props.onLoadState,
  );
  return (
    <SceneBoundary onError={props.onError}>
      <Canvas
        frameloop={props.active === false ? "never" : "demand"}
        shadows
        dpr={
          typeof window === "undefined" || innerWidth < 701
            ? 1
            : Math.min(devicePixelRatio, 1.25)
        }
        camera={{ position: [0, 1.1, -6], fov: 36, near: 0.05, far: 70 }}
        gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
        onCreated={({ gl, size }) => {
          gl.setPixelRatio(
            size.width < 701 ? 1 : Math.min(devicePixelRatio, 1.25),
          );
          gl.setClearAlpha(0);
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.domElement.setAttribute(
            "aria-label",
            "Real 3D rear view of the artist-built GT-R R35",
          );
          gl.domElement.setAttribute("role", "img");
        }}
      >
        <ContextHealth onError={props.onError} />
        <RearCamera
          progress={props.progress}
          reducedMotion={props.reducedMotion}
        />
        {asset ? (
          <>
            {/* Capture shader failures before Drei renders its environment in a layout effect. */}
            <RearRenderPreparation
              onReady={props.onReady}
              onError={props.onError}
            />
            <RearStudio />
            <RearVehicle asset={asset} />
          </>
        ) : null}
      </Canvas>
    </SceneBoundary>
  );
}
