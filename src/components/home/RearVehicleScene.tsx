import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
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
    gl = useThree((s) => s.gl);
  const current = useRef(reducedMotion ? 1 : progress),
    target = reducedMotion ? 1 : progress;
  useEffect(() => {
    invalidate();
  }, [target, size.width, size.height, invalidate]);
  useFrame((_, delta) => {
    const diff = target - current.current;
    current.current =
      reducedMotion || Math.abs(diff) < 0.0005
        ? target
        : current.current + diff * (1 - Math.exp(-10 * Math.min(delta, 0.1)));
    const p = current.current,
      aspect = size.width / Math.max(1, size.height);
    const farDistance = Math.max(
      3.2,
      2.3 / (2 * Math.tan(Math.PI / 10) * aspect),
    );
    camera.position.set(
      0,
      1.02 + 0.14 * p,
      -2.35 - farDistance * (0.48 + 0.52 * p),
    );
    camera.fov = 36;
    camera.lookAt(0, 0.79, -2);
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
    applyVehicleAppearance(asset.bindings, "#9fa6ac", true);
    for (const b of asset.bindings) {
      if (b.role === "paint") {
        b.material.metalness = 0.12;
        b.material.roughness = 0.43;
        if (b.material instanceof MeshPhysicalMaterial) {
          b.material.clearcoat = 0.55;
          b.material.clearcoatRoughness = 0.3;
        }
      }
      if (b.role === "taillights") b.material.emissiveIntensity = 2;
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
          material.opacity = 0.38;
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
function RearStudio() {
  return (
    <>
      <color attach="background" args={["#11151a"]} />
      <fog attach="fog" args={["#11151a", 10, 20]} />
      <StageGeometry>
        <ambientLight intensity={0.18} />
        <directionalLight position={[0, 5, -7]} intensity={1.3} />
        <Environment resolution={128} frames={1} environmentIntensity={0.65}>
          <color attach="background" args={["#41474e"]} />
          <Lightformer
            form="rect"
            intensity={2}
            position={[0, 5, -3]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[7, 6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.5}
            position={[-6, 2, -2]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[6, 4, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.2}
            position={[6, 2, 1]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[4, 5, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.8}
            position={[0, 3, -8]}
            scale={[8, 4, 1]}
          />
        </Environment>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[150, 150]} />
          <meshStandardMaterial
            color="#11151a"
            roughness={1}
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
}

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
          gl.toneMappingExposure = 0.9;
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
        <RearStudio />
        {asset && <RearVehicle asset={asset} onReady={props.onReady} />}
      </Canvas>
    </SceneBoundary>
  );
}
