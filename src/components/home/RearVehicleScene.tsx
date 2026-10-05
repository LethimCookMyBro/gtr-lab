import { memo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Color,
  Light,
  RectAreaLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
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
    scene.background = new Color("#030405");
    invalidate();
  }, [target, size.width, size.height, invalidate, scene]);
  useFrame(() => {
    // Browser scroll already supplies RAF-paced positions. Apply one demand frame
    // instead of scheduling a second animation that can backlog on slower GPUs.
    const p = target,
      aspect = size.width / Math.max(1, size.height);
    const t = Math.min(1, Math.max(0, (p - 0.13) / 0.64));
    const reveal = t * t * (3 - 2 * t);
    // Begin with emission only, then bring the studio onto the actual body.
    scene.environmentIntensity = reveal * 0.88;
    const key = scene.getObjectByName("rear-key"),
      fill = scene.getObjectByName("rear-fill");
    if (key instanceof Light) key.intensity = reveal * 0.5;
    if (fill instanceof Light) fill.intensity = reveal * 0.06;
    const sweep = scene.getObjectByName("rear-sweep");
    if (sweep instanceof RectAreaLight) {
      const pass = Math.min(1, Math.max(0, (p - 0.2) / 0.6));
      // This is scroll-bound, never a render loop. Lamps retain the opening beat;
      // the white source crosses the shoulders, then drops toward the exhausts.
      sweep.intensity =
        reducedMotion || pass === 0 || pass === 1
          ? 0
          : Math.sin(pass * Math.PI) * 3.2;
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
    applyVehicleAppearance(asset.bindings, "#656a6d", true);
    for (const b of asset.bindings) {
      if (b.role === "paint") {
        b.material.metalness = 0.68;
        b.material.roughness = 0.28;
        if (b.material instanceof MeshPhysicalMaterial) {
          b.material.clearcoat = 1;
          b.material.clearcoatRoughness = 0.18;
        }
      }
      if (b.role === "taillights") {
        b.material.emissive.set("#ff1007");
        b.material.emissiveIntensity = 1.35;
        // ACES shifts strong red emitters toward orange. Keep the real LED hue.
        b.material.toneMapped = false;
      }
      if (b.role === "headlights") b.material.emissiveIntensity = 0;
    }
    // Exact materials verified in the already-public GLB. Only owned copies change.
    asset.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        if (material.name === "Glass.001") {
          material.color.set("#6d0208");
          material.opacity = 0.2;
          material.envMapIntensity = 0.08;
          material.transparent = true;
          material.depthWrite = false;
          material.metalness = 0;
          material.roughness = 0.28;
        }
        if (material.name === "Reverse_Emitter") {
          material.color.set("#343941");
          material.metalness = 0.05;
          material.roughness = 0.4;
          material.emissiveIntensity = 0;
        }
      }
    });
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
      <fog attach="fog" args={["#030405", 13, 30]} />
      <StageGeometry>
        <ambientLight name="rear-fill" intensity={0} />
        <directionalLight
          name="rear-key"
          position={[-3, 6, -5]}
          intensity={0}
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
        <Environment resolution={256} frames={1}>
          <color attach="background" args={["#090a0b"]} />
          <Lightformer
            form="rect"
            intensity={2.1}
            position={[0, 4.5, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[7, 1.5, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            position={[-4, 2, -1.2]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[1.2, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            position={[4, 2, -1.2]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[1.2, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            position={[0, 2.8, -6]}
            scale={[6, 0.65, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.2}
            position={[0, 0.4, -4]}
            scale={[4, 0.3, 1]}
          />
        </Environment>
        {/* Drei blurs with an unparented plane at world Y=0. Its upward-facing
            camera must stay below zero, with the receiver just above the floor. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <planeGeometry args={[150, 150]} />
          <meshStandardMaterial
            color="#08090a"
            roughness={0.88}
            metalness={0}
            envMapIntensity={0.12}
          />
        </mesh>
        <ContactShadows
          position={[0, -0.001, 0]}
          opacity={0.74}
          scale={7}
          blur={1.5}
          far={3}
          resolution={256}
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
