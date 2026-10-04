import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei/core/AdaptiveDpr";
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from "three";
import { CameraRig } from "./CameraRig";
import { RecoverableEnvironment } from "./RecoverableEnvironment";
import { setViewerAccessibility } from "./keyboardControls";
import { SceneBoundary, CanvasFallback } from "./SceneBoundary";
import {
  applyVehicleAppearance,
  stepVehicleAppearance,
  vehicleCapabilities,
} from "./materialAdapter";
import { useVehicleAsset } from "./useVehicleAsset";
import { useSceneReadiness } from "./useSceneReadiness";
import { CAMERA_VIEWS } from "./sceneHelpers";
import type { PreparedVehicle } from "./materialAdapter";
import type { VehicleSceneProps } from "./types";
export type { VehicleSceneProps } from "./types";

function Vehicle({
  asset,
  paint,
  lights,
  reducedMotion,
  onReady,
}: {
  asset: PreparedVehicle;
  paint: string;
  lights: boolean;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const renderedFrames = useRef(0);
  const ready = useRef(false);
  const initializedAppearance = useRef(false);
  useEffect(() => {
    if (!initializedAppearance.current || reducedMotion) {
      applyVehicleAppearance(asset.bindings, paint, lights);
      initializedAppearance.current = true;
    }
    invalidate();
  }, [asset, paint, lights, reducedMotion, invalidate]);
  useFrame((_, delta) => {
    if (
      !stepVehicleAppearance(
        asset.bindings,
        paint,
        lights,
        delta,
        reducedMotion,
      )
    )
      invalidate();
    // Report after the actual scene has completed a rendered frame, not merely fetched.
    if (!ready.current && ++renderedFrames.current >= 2) {
      ready.current = true;
      onReady();
    }
    if (!ready.current) invalidate();
  });
  return (
    <group scale={asset.scale} position={asset.position} dispose={null}>
      <primitive object={asset.scene} dispose={null} />
    </group>
  );
}

function ContextHealth({ onError }: { onError: (message: string) => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    function onLost(event: Event) {
      event.preventDefault();
      onError(
        "The graphics connection was lost. Retry the viewer to restore the model.",
      );
    }
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl, onError]);
  return null;
}

/** One canvas; mount with a new key to retry a failed graphics context. */
export default function VehicleScene(props: VehicleSceneProps) {
  const asset = useVehicleAsset(
    props.url,
    props.materialRoles,
    props.onProgress,
    props.onError,
    props.disabledEmissive,
  );
  const readiness = useSceneReadiness(
    props.url,
    `${props.environment}:${props.environmentRequest ?? 0}`,
    props.onReady,
  );
  const capabilitiesCallback = useRef(props.onCapabilities);
  capabilitiesCallback.current = props.onCapabilities;
  useEffect(() => {
    capabilitiesCallback.current?.(
      asset
        ? vehicleCapabilities(asset.bindings)
        : { paint: false, lights: false },
    );
  }, [asset]);
  return (
    <SceneBoundary key={props.url} onError={props.onError}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 1.75]}
        performance={{ min: 0.6 }}
        camera={{
          position: CAMERA_VIEWS.hero.position,
          fov: CAMERA_VIEWS.hero.fov,
          near: 0.02,
          far: 700,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: true,
        }}
        fallback={<CanvasFallback />}
        onCreated={({ gl }) => {
          // ContactShadows removes scene.background for its depth pass. Clear
          // unused render-target pixels transparently even with an opaque canvas.
          gl.setClearAlpha(0);
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          gl.shadowMap.type = PCFSoftShadowMap;
          setViewerAccessibility(gl.domElement, props.preset === "interior");
        }}
      >
        <ContextHealth onError={props.onError} />
        <AdaptiveDpr />
        <CameraRig
          preset={props.preset}
          requestId={props.cameraRequest}
          cameraViews={props.cameraViews}
          autoRotate={props.autoRotate}
          reducedMotion={props.reducedMotion}
          onManual={props.onManual}
        />
        {asset ? (
          <>
            <RecoverableEnvironment
              key={`${props.environment}-${props.environmentRequest ?? 0}`}
              environment={props.environment}
              reducedMotion={props.reducedMotion}
              onFallback={props.onEnvironmentFallback}
              onReady={readiness.onEnvironmentRendered}
            />
            <Vehicle
              key={asset.scene.uuid}
              asset={asset}
              paint={props.paint}
              lights={props.lights}
              reducedMotion={props.reducedMotion}
              onReady={readiness.onVehicleRendered}
            />
          </>
        ) : (
          <color attach="background" args={["#111316"]} />
        )}
      </Canvas>
    </SceneBoundary>
  );
}
