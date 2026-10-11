import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  Mesh,
  PerspectiveCamera,
  Vector3,
  type Object3D,
  type Scene,
} from "three";
import { CabinAttachment } from "./CabinAttachment";
import { CameraRig } from "./CameraRig";
import { cabinCameraView, type CabinWindowStatus } from "./cabinPreview";
import { createCabinPreparationSteps } from "./cabinPreparationSteps";
import {
  enqueueRendererPreparation,
  awaitCompletedMain,
} from "./rendererPreparation";
import type { PreparedVehicle } from "./materialAdapter";
import type { VehicleSceneProps } from "./types";

type Pose = {
  position: number[];
  quaternion: number[];
  fov: number;
  near: number;
  far: number;
};
function pose(camera: PerspectiveCamera): Pose {
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}
function matchesPose(camera: PerspectiveCamera, expected: Pose) {
  const position = camera.position.toArray(),
    quaternion = camera.quaternion.toArray();
  const dot = quaternion.reduce(
    (sum, value, index) => sum + value * expected.quaternion[index],
    0,
  );
  return (
    position.every(
      (value, index) => Math.abs(value - expected.position[index]) < 1e-7,
    ) &&
    Math.abs(Math.abs(dot) - 1) < 1e-8 &&
    Math.abs(camera.fov - expected.fov) < 1e-5 &&
    Math.abs(camera.near - expected.near) < 1e-7 &&
    Math.abs(camera.far - expected.far) < 1e-7
  );
}
function attached(object: Object3D | undefined, scene: Scene) {
  for (let node = object; node; node = node.parent ?? undefined) {
    if (!node.visible) return false;
    if (node === scene) return true;
  }
  return false;
}
type Presentation = {
  key: string;
  generation: number;
  phase: "driver" | "return";
  outside?: Pose;
  signal: AbortSignal;
  failure?: string;
};
type Props = {
  asset: PreparedVehicle | null;
  loadFailure?: string;
  exterior: PreparedVehicle;
  proxy: PreparedVehicle | null;
  proxyFailed: boolean;
  onProxyError: () => void;
  onWindowStatus?: (status: CabinWindowStatus) => void;
  request: number;
  props: VehicleSceneProps;
};

/** Route-owned residency. The DOM loading mask remains until both main proofs. */
export function CabinRuntime({
  asset,
  loadFailure,
  exterior,
  proxy,
  proxyFailed,
  onProxyError,
  onWindowStatus,
  request,
  props,
}: Props) {
  const gl = useThree((state) => state.gl),
    scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size),
    dpr = useThree((state) => state.viewport.dpr);
  const callbacks = useRef(props);
  callbacks.current = props;
  const assetKey = `${request}:${asset?.scene.uuid ?? "none"}`;
  const resourceKey = `${assetKey}:${props.environment}:${props.environmentRequest ?? 0}`;
  const latestKey = useRef(resourceKey);
  latestKey.current = resourceKey;
  const [preparedKey, setPreparedKey] = useState<string | null>(null);
  const [ownerFailure, setOwnerFailure] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const livePresentation = useRef(presentation);
  livePresentation.current = presentation;
  const generation = useRef(0);
  const appliedState = useRef<{ key: string; settled: boolean } | null>(null);
  const appliedKey = presentation
    ? `${presentation.key}:${presentation.generation}:${presentation.phase}`
    : `${assetKey}:view:${props.cabin?.phase === "active" ? props.cabin.seat : props.preset}`;
  const preparing = props.cabinPreparation?.phase === "loading";
  const mayPrepare = preparing && props.cabinPreparationAllowed !== false;
  const masked =
    props.cabinPreparation?.phase !== "ready" &&
    props.cabinPreparation?.phase !== "error";
  const driverView = useMemo(
    () => cabinCameraView("driver", exterior),
    [exterior],
  );
  const desiredSeat = props.cabin?.phase === "active" ? props.cabin.seat : null;
  const desiredView = useMemo(
    () => (desiredSeat ? cabinCameraView(desiredSeat, exterior) : undefined),
    [desiredSeat, exterior],
  );
  const showingDriver =
    presentation?.key === resourceKey && presentation.phase === "driver";
  // Residency survives lighting choices. The initial presentation certificate
  // is environment-specific; it is not a permanent no-compilation guarantee.
  const fullPrepared = !!asset && preparedKey === assetKey;
  const cabinView = showingDriver
    ? driverView
    : fullPrepared
      ? desiredView
      : undefined;

  useEffect(() => {
    if (!mayPrepare || (!asset && !ownerFailure && !loadFailure)) return;
    const abort = new AbortController(),
      currentGeneration = ++generation.current;
    setPresentation(null);
    const startedAt = performance.now();
    if (ownerFailure || loadFailure) {
      setPresentation({
        key: resourceKey,
        generation: currentGeneration,
        phase: "return",
        signal: abort.signal,
        failure: ownerFailure ?? loadFailure,
      });
      return () => abort.abort();
    }
    if (!asset) return () => abort.abort();
    void (async () => {
      for (const step of createCabinPreparationSteps(
        gl,
        scene,
        camera,
        asset,
        exterior,
      )) {
        await enqueueRendererPreparation(gl, {
          signal: abort.signal,
          run: step.run,
        });
        if (abort.signal.aborted || latestKey.current !== resourceKey) return;
      }
      setPreparedKey(assetKey);
      setPresentation({
        key: resourceKey,
        generation: currentGeneration,
        phase:
          callbacks.current.cabin?.phase === "active" ? "return" : "driver",
        outside: pose(camera),
        signal: abort.signal,
      });
      // Measures preparation separately from later entry. No latency claim or
      // readiness transition is based on this duration.
      try {
        performance.measure?.("gtr-cabin-resource-preparation", {
          start: startedAt,
          end: performance.now(),
        });
      } catch {
        /* Optional measurement cannot change readiness. */
      }
    })().catch((error: unknown) => {
      if (!abort.signal.aborted && latestKey.current === resourceKey)
        setPresentation({
          key: resourceKey,
          generation: currentGeneration,
          phase: "return",
          signal: abort.signal,
          failure:
            error instanceof Error
              ? error.message
              : "Interior preparation failed.",
        });
    });
    return () => abort.abort();
  }, [
    asset,
    exterior,
    gl,
    scene,
    camera,
    assetKey,
    resourceKey,
    request,
    mayPrepare,
    ownerFailure,
    loadFailure,
  ]);

  useLayoutEffect(() => {
    if (
      !presentation ||
      presentation.key !== resourceKey ||
      (presentation.phase === "driver" && !asset)
    )
      return;
    const abort = new AbortController();
    const cancel = () => abort.abort();
    presentation.signal.addEventListener("abort", cancel, { once: true });
    if (presentation.signal.aborted) abort.abort();
    const driver = new PerspectiveCamera();
    driver.position.fromArray(driverView.position);
    driver.up.copy(camera.up);
    driver.lookAt(new Vector3(...driverView.target));
    driver.fov = driverView.fov;
    driver.near = driverView.near;
    driver.far = driverView.far;
    const expected =
      presentation.phase === "driver" ? pose(driver) : presentation.outside;
    const width = Math.floor(size.width * dpr),
      height = Math.floor(size.height * dpr);
    const token = JSON.stringify([
      resourceKey,
      presentation.generation,
      presentation.phase,
      width,
      height,
      dpr,
      expected,
    ]);
    const wantsFull = presentation.phase === "driver" || desiredSeat !== null;
    const projection = new PerspectiveCamera();
    const stamp = () => {
      if (
        abort.signal.aborted ||
        livePresentation.current !== presentation ||
        latestKey.current !== resourceKey ||
        gl.domElement.width !== width ||
        gl.domElement.height !== height ||
        gl.getPixelRatio() !== dpr ||
        appliedState.current?.key !== appliedKey ||
        !appliedState.current.settled ||
        Math.abs(camera.aspect - size.width / Math.max(1, size.height)) >
          1e-7 ||
        (expected && !matchesPose(camera, expected)) ||
        !attached(exterior.scene, scene) ||
        attached(asset?.scene, scene) !== wantsFull ||
        (wantsFull && attached(proxy?.scene, scene))
      )
        return null;
      projection.fov = camera.fov;
      projection.aspect = camera.aspect;
      projection.near = camera.near;
      projection.far = camera.far;
      projection.zoom = camera.zoom;
      projection.updateProjectionMatrix();
      if (
        !projection.projectionMatrix.elements.every(
          (value, index) =>
            Math.abs(value - camera.projectionMatrix.elements[index]) < 1e-9,
        )
      )
        return null;
      const exteriorMaterials: string[][] = [];
      exterior.scene.traverse((object) => {
        if (object instanceof Mesh)
          exteriorMaterials.push(
            (Array.isArray(object.material)
              ? object.material
              : [object.material]
            ).map((material) => material.uuid),
          );
      });
      // Before a driver switch, a failed resource job has no fixed restore
      // pose. Certify the actual exterior frame after CameraRig's admitted
      // update instead of waiting for an obsolete pre-preparation pose.
      return JSON.stringify([
        token,
        pose(camera),
        camera.projectionMatrix.elements,
        attached(proxy?.scene, scene) ? proxy?.scene.uuid : null,
        exteriorMaterials,
      ]);
    };
    const completed = awaitCompletedMain(gl, { signal: abort.signal, stamp });
    invalidate();
    void completed
      .then(() => {
        if (abort.signal.aborted || livePresentation.current !== presentation)
          return;
        if (presentation.phase === "driver")
          setPresentation({ ...presentation, phase: "return" });
        else {
          setPresentation(null);
          if (presentation.failure)
            callbacks.current.onCabinError?.(request, presentation.failure);
          else callbacks.current.onCabinReady?.(request);
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted && latestKey.current === resourceKey) {
          const message =
            error instanceof Error
              ? error.message
              : "Interior presentation failed.";
          if (
            message ===
              "The main readiness stamp changed before native completion." ||
            message === "The completed main presentation was superseded."
          )
            setPresentation({
              ...presentation,
              generation: ++generation.current,
            });
          else if (presentation.phase === "driver")
            setPresentation({
              ...presentation,
              phase: "return",
              failure: message,
            });
          else callbacks.current.onError(message);
        }
      });
    return () => {
      abort.abort();
      presentation.signal.removeEventListener("abort", cancel);
    };
  }, [
    presentation,
    resourceKey,
    asset,
    exterior,
    proxy,
    gl,
    scene,
    camera,
    driverView,
    desiredSeat,
    size.width,
    size.height,
    dpr,
    request,
    invalidate,
    appliedKey,
  ]);

  return (
    <>
      <CameraRig
        preset={props.preset}
        requestId={props.cameraRequest}
        cameraViews={props.cameraViews}
        cabinView={cabinView}
        autoRotate={masked ? false : props.autoRotate}
        reducedMotion={masked || props.reducedMotion}
        interactive={!masked}
        appliedState={appliedState}
        appliedKey={appliedKey}
        onManual={props.onManual}
      />
      <CabinAttachment
        asset={asset}
        exterior={exterior}
        proxy={proxy}
        proxyFailed={proxyFailed}
        onProxyError={onProxyError}
        onOwnerError={setOwnerFailure}
        onWindowStatus={onWindowStatus}
        active={!!cabinView}
        prepared={fullPrepared}
        request={request}
        onReady={() => {}}
        onError={(failedRequest, message) =>
          callbacks.current.onCabinError?.(failedRequest, message)
        }
      />
    </>
  );
}
