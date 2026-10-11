import { useEffect, useLayoutEffect, useRef, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  initialVehiclePixelRatio,
  VehiclePixelDensity,
} from "./VehiclePixelDensity";
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from "three";
import { CABIN_URL, CABIN_PROXY_URL, cabinCameraView } from "./cabinPreview";
import { prepareAsyncRendererDisposal } from "./asyncRendererDisposal";
import { CabinAttachment } from "./CabinAttachment";
import { createTargetTransitionClock } from "./targetTransition";
import { CameraRig } from "./CameraRig";
import { DemandRenderBackpressure } from "./DemandRenderBackpressure";
import { registerFunctionalState } from "./functionalRenderObservation";
import { RecoverableEnvironment } from "./RecoverableEnvironment";
import { setViewerAccessibility } from "./keyboardControls";
import { SceneBoundary, CanvasFallback } from "./SceneBoundary";
import {
  applyVehicleAppearance,
  blendVehicleAppearance,
  vehicleCapabilities,
} from "./materialAdapter";
import { useVehicleAsset } from "./useVehicleAsset";
import { useSceneReadiness } from "./useSceneReadiness";
import { invalidateSceneShadows } from "./staticShadowPolicy";
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
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    invalidateSceneShadows(scene);
    invalidate();
    return () => {
      invalidateSceneShadows(scene);
      invalidate();
    };
  }, [asset, scene, invalidate]);
  const renderedFrames = useRef(0);
  const ready = useRef(false);
  const initializedAppearance = useRef(false);
  const transitionClock = useMemo(() => createTargetTransitionClock(), []);
  useLayoutEffect(() => {
    transitionClock.reset();
  }, [asset, paint, transitionClock]);
  useLayoutEffect(() => {
    if (!initializedAppearance.current || reducedMotion) {
      applyVehicleAppearance(asset.bindings, paint, lights);
      initializedAppearance.current = true;
    }
    invalidate();
  }, [asset, paint, lights, reducedMotion, invalidate]);
  useFrame(() => {
    if (
      !blendVehicleAppearance(
        asset.bindings,
        paint,
        lights,
        transitionClock.sampleAlpha(reducedMotion),
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

function FunctionalSceneState({
  asset,
  cabinAsset,
  proxyAsset,
  props,
}: {
  asset: PreparedVehicle | null;
  cabinAsset: PreparedVehicle | null;
  proxyAsset: PreparedVehicle | null;
  props: VehicleSceneProps;
}) {
  const gl = useThree((state) => state.gl),
    scene = useThree((state) => state.scene);
  useLayoutEffect(
    () =>
      registerFunctionalState(gl, "vehicle", () => {
        const attached = (value: PreparedVehicle | null) => {
          let node = value?.scene;
          while (node) {
            if (!node.visible) return false;
            if (node === scene) return true;
            node = node.parent ?? undefined;
          }
          return false;
        };
        return {
          url: props.url,
          lights: props.lights,
          paint: props.paint,
          environment: props.environment,
          environmentRequest: props.environmentRequest ?? 0,
          cabinSeat: props.cabin?.phase === "active" ? props.cabin.seat : null,
          exterior: attached(asset),
          full: attached(cabinAsset),
          proxy: attached(proxyAsset),
          lamps:
            asset?.bindings
              .filter((binding) => binding.role !== "paint")
              .map(({ role, material }) => ({
                role,
                emissive: material.emissive.toArray(),
                intensity: material.emissiveIntensity,
              })) ?? [],
        };
      }),
    [gl, scene, asset, cabinAsset, proxyAsset, props],
  );
  return null;
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
  const [dpr, setDpr] = useState(initialVehiclePixelRatio);
  const asset = useVehicleAsset(
    props.url,
    props.materialRoles,
    props.onProgress,
    props.onError,
    props.disabledEmissive,
  );
  const cabinRequested =
    props.cabin?.phase === "loading" || props.cabin?.phase === "active";
  const cabinRequest =
    props.cabin && props.cabin.phase !== "closed" ? props.cabin.request : 0;
  const [proxyFailed, setProxyFailed] = useState(false);
  const proxyAsset = useVehicleAsset(
    props.cabin ? CABIN_PROXY_URL : null,
    { paint: [], headlights: [], taillights: [] },
    () => {},
    () => setProxyFailed(true),
    [],
    (progress) => {
      if (progress.phase === "downloading" && progress.loadedBytes === 0) {
        setProxyFailed(false);
        props.onWindowStatus?.("loading");
      }
    },
    true,
    props.url,
  );
  const cabinAsset = useVehicleAsset(
    cabinRequested ? CABIN_URL : null,
    { paint: [], headlights: [], taillights: [] },
    () => {},
    (message) => props.onCabinError?.(cabinRequest, message),
    [],
    (progress) => props.onCabinProgress?.(cabinRequest, progress),
    true,
    cabinRequest,
  );
  // Canvas is created before the asynchronous assets arrive. Read the latest
  // owners at final renderer disposal, after its scene children detach/restore.
  const ownedAssets = useRef({ asset, cabinAsset, proxyAsset });
  ownedAssets.current = { asset, cabinAsset, proxyAsset };
  const seat = props.cabin?.phase === "active" ? props.cabin.seat : null;
  const cabinView = useMemo(
    () =>
      seat && asset && cabinAsset ? cabinCameraView(seat, asset) : undefined,
    [seat, asset, cabinAsset],
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
        dpr={dpr}
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
          prepareAsyncRendererDisposal(gl, () => {
            ownedAssets.current.cabinAsset?.dispose();
            ownedAssets.current.proxyAsset?.dispose();
            ownedAssets.current.asset?.dispose();
          });
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
        <DemandRenderBackpressure
          onError={props.onError}
          onPendingChange={props.onRenderPending}
        />
        <ContextHealth onError={props.onError} />
        <FunctionalSceneState
          asset={asset}
          cabinAsset={cabinAsset}
          proxyAsset={proxyAsset}
          props={props}
        />
        <VehiclePixelDensity onChange={setDpr} />
        <CameraRig
          preset={props.preset}
          requestId={props.cameraRequest}
          cameraViews={props.cameraViews}
          cabinView={cabinView}
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
            {props.cabin && (
              <CabinAttachment
                asset={cabinRequested ? cabinAsset : null}
                proxy={proxyAsset}
                proxyFailed={proxyFailed}
                onProxyError={() => setProxyFailed(true)}
                onWindowStatus={props.onWindowStatus}
                exterior={asset}
                active={props.cabin?.phase === "active"}
                request={cabinRequest}
                onReady={(request) => props.onCabinReady?.(request)}
                onError={(request, message) =>
                  props.onCabinError?.(request, message)
                }
              />
            )}
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
