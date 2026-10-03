import { memo, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Color,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { models } from "../../data/models";
import { useVehicleAsset } from "../three/useVehicleAsset";
import { applyVehicleAppearance } from "../three/materialAdapter";
import type { PreparedVehicle } from "../three/materialAdapter";
import { StageGeometry } from "../three/StageGeometry";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import { SceneBoundary } from "../three/SceneBoundary";
type Props = {
  progress: number;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onProgress: (value: number) => void;
};
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
  const current = useRef(reducedMotion ? 1 : progress),
    target = reducedMotion ? 1 : progress;
  useEffect(() => {
    scene.background = new Color("#030405");
    invalidate();
  }, [target, size.width, size.height, invalidate, scene]);
  useFrame((_, delta) => {
    const diff = target - current.current;
    current.current =
      reducedMotion || Math.abs(diff) < 0.0005
        ? target
        : current.current + diff * (1 - Math.exp(-10 * Math.min(delta, 0.1)));
    const p = current.current,
      aspect = size.width / Math.max(1, size.height);
    const t = Math.min(1, Math.max(0, (p - 0.13) / 0.64));
    const reveal = t * t * (3 - 2 * t);
    // Begin with emission only, then bring the studio onto the actual body.
    scene.environmentIntensity = reveal * 0.95;
    const key = scene.getObjectByName("rear-key"),
      fill = scene.getObjectByName("rear-fill");
    if (key instanceof Light) key.intensity = reveal * 1.35;
    if (fill instanceof Light) fill.intensity = reveal * 0.06;
    const distance = Math.max(
      5.3,
      2.12 / (2 * Math.tan(Math.PI / 12) * aspect * 0.86),
    );
    camera.position.set(0, 0.96, -2.35 - distance * (0.9 + 0.1 * p));
    camera.fov = 30;
    camera.aspect = aspect;
    camera.lookAt(0, 0.66, -1.6);
    camera.updateProjectionMatrix();
    gl.domElement.dataset.rearProgress = p.toFixed(4);
    if (Math.abs(target - p) > 0.0005) invalidate();
  });
  return null;
}
function RearVehicle({
  asset,
  onReady,
}: {
  asset: PreparedVehicle;
  onReady: () => void;
}) {
  const invalidate = useThree((s) => s.invalidate),
    frames = useRef(0);
  useEffect(() => {
    applyVehicleAppearance(asset.bindings, "#68737b", true);
    for (const b of asset.bindings) {
      if (b.role === "paint") {
        b.material.metalness = 0.82;
        b.material.roughness = 0.26;
        if (b.material instanceof MeshPhysicalMaterial) {
          b.material.clearcoat = 1;
          b.material.clearcoatRoughness = 0.12;
        }
      }
      if (b.role === "taillights") {
        b.material.emissive.set("#ff1007");
        b.material.emissiveIntensity = 3.2;
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
          material.opacity = 0.15;
          material.transparent = true;
          material.depthWrite = false;
          material.metalness = 0;
          material.roughness = 0.18;
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
  useFrame(() => {
    if (++frames.current === 2) onReady();
    if (frames.current < 2) invalidate();
  });
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
        <Environment resolution={256} frames={1}>
          <color attach="background" args={["#030405"]} />
          <Lightformer
            form="rect"
            intensity={3.5}
            position={[0, 5, -1]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[7, 2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2.2}
            position={[-6, 2, -2]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[5, 1.6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2}
            position={[6, 2, 1]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[4, 1, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.55}
            position={[0, 3, -8]}
            scale={[6, 1, 1]}
          />
        </Environment>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[150, 150]} />
          <meshStandardMaterial
            color="#06080a"
            roughness={0.6}
            metalness={0}
            envMapIntensity={0.02}
          />
        </mesh>
        <ContactShadows
          position={[0, 0.001, 0]}
          opacity={0.6}
          scale={9}
          blur={1.6}
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
/** Uses only the already-published Ciasny asset; this owns and disposes its load. */
export default function RearVehicleScene(props: Props) {
  const asset = useVehicleAsset(
    source.url!,
    source.materialRoles,
    props.onProgress,
    props.onError,
    source.disabledEmissive,
  );
  return (
    <SceneBoundary onError={props.onError}>
      <Canvas
        frameloop="demand"
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
            <RearStudio />
            <RearVehicle asset={asset} onReady={props.onReady} />
          </>
        ) : null}
      </Canvas>
    </SceneBoundary>
  );
}
