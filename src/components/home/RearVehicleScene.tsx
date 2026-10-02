import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
} from "three";
import { models } from "../../data/models";
import { useVehicleAsset } from "../three/useVehicleAsset";
import { applyVehicleAppearance } from "../three/materialAdapter";
import type { PreparedVehicle } from "../three/materialAdapter";
import { StudioLighting } from "../three/StudioLighting";
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
    applyVehicleAppearance(asset.bindings, "#70777c", true);
    for (const b of asset.bindings) {
      if (b.role === "paint") {
        b.material.metalness = 0.45;
        b.material.roughness = 0.29;
      }
      if (b.role === "taillights") b.material.emissiveIntensity = 0.8;
      if (b.role === "headlights") b.material.emissiveIntensity = 0;
    }
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
        <StudioLighting environment="studio" reducedMotion />
        {asset && <RearVehicle asset={asset} onReady={props.onReady} />}
      </Canvas>
    </SceneBoundary>
  );
}
