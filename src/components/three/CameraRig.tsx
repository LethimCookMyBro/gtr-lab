import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  cameraView,
  exteriorDistanceScale,
  VENUE_CAMERA_RADIUS,
  interpolationAlpha,
  type CameraView,
} from "./sceneHelpers";
import type { CabinCameraView } from "./cabinPreview";
import type { VectorTuple } from "./sceneHelpers";
import { useInteriorLook } from "./useInteriorLook";
import {
  connectExteriorKeyboard,
  setViewerAccessibility,
} from "./keyboardControls";

type Props = {
  preset: string;
  cabinView?: CabinCameraView;
  requestId?: number;
  autoRotate: boolean;
  reducedMotion: boolean;
  onManual: () => void;
  cameraViews?: Partial<Record<string, CameraView>>;
};

export function CameraRig({
  preset: exteriorPreset,
  cabinView,
  requestId = 0,
  autoRotate,
  reducedMotion,
  onManual,
  cameraViews,
}: Props) {
  const preset = cabinView ? "interior" : exteriorPreset;
  const wasPreview = useRef(false);
  const exteriorSnapshot = useRef<{
    preset: string;
    request: number;
    view: CameraView;
    near: number;
    far: number;
  } | null>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const controls = useRef<OrbitControlsImpl>(null);
  const moving = useRef(true);
  const manuallyStopped = useRef(false);
  const wasInterior = useRef(preset === "interior");
  const leavingInterior = useRef(false);
  const lookTransition = useMemo(
    () => ({
      direction: new Vector3(),
      rotation: new Quaternion(),
      matrix: new Matrix4(),
    }),
    [],
  );
  const saved = exteriorSnapshot.current;
  const restoring =
    !cabinView &&
    saved?.preset === exteriorPreset &&
    saved.request === requestId;
  const view =
    cabinView ?? (restoring ? saved.view : cameraView(preset, cameraViews));
  const aspect = size.width / Math.max(1, size.height);
  const targetFov =
    restoring || preset === "wheel" || preset === "interior"
      ? view.fov
      : view.fov * Math.min(1.25, Math.max(1, 1 / aspect));
  const destination = useMemo(() => {
    const target = new Vector3(...view.target);
    const position = new Vector3(...view.position);
    // Preserve whole-car framing in the mobile viewport; detail views remain close.
    const distanceScale =
      restoring || preset === "wheel" || preset === "interior"
        ? 1
        : exteriorDistanceScale(
            Math.min(1.25, Math.max(1, 1 / aspect)),
            position.distanceTo(target),
            size.width,
          );
    position.sub(target).multiplyScalar(distanceScale).add(target);
    return {
      target,
      position,
      maxDistance: Math.min(
        VENUE_CAMERA_RADIUS,
        view.maxDistance * distanceScale,
      ),
    };
  }, [aspect, preset, view, size.width, restoring]);

  useLayoutEffect(() => {
    const orbit = controls.current;
    if (cabinView && !wasPreview.current && orbit) {
      const tuple = (vector: Vector3): VectorTuple => [
        vector.x,
        vector.y,
        vector.z,
      ];
      exteriorSnapshot.current = {
        preset: exteriorPreset,
        request: requestId,
        near: camera.near,
        far: camera.far,
        view: {
          position: tuple(camera.position),
          target: tuple(orbit.target),
          fov: camera.fov,
          minDistance: orbit.minDistance,
          maxDistance: orbit.maxDistance,
        },
      };
    }
    if (cabinView) {
      // Drain the previous exterior damping delta before fixing the new eye.
      // The snapshot above retains the exact pre-drain exterior pose.
      if (orbit && !wasPreview.current) {
        orbit.autoRotate = false;
        orbit.enableDamping = false;
        orbit.update();
      }
      camera.near = cabinView.near;
      camera.far = cabinView.far;
      // Seat changes never translate the eye through the console or seatbacks.
      // The fixed eye changes once; orientation/FOV settle smoothly below.
      const direction = camera.getWorldDirection(new Vector3());
      camera.position.copy(destination.position);
      orbit?.target.copy(direction.add(camera.position));
    } else if (wasPreview.current && exteriorSnapshot.current) {
      camera.near = exteriorSnapshot.current.near;
      camera.far = exteriorSnapshot.current.far;
    }
    wasPreview.current = Boolean(cabinView);
    moving.current = true;
    manuallyStopped.current = false;
    leavingInterior.current = wasInterior.current && preset !== "interior";
    if (controls.current) {
      // Interior look owns the camera quaternion, so the old orbit target no
      // longer describes its view. Start the exit from the direction on screen.
      if (leavingInterior.current) {
        const lookDistance = Math.max(
          0.05,
          camera.position.distanceTo(controls.current.target),
        );
        camera
          .getWorldDirection(controls.current.target)
          .multiplyScalar(lookDistance)
          .add(camera.position);
      }
      controls.current.autoRotate = false;
      controls.current.enableDamping = false;
      controls.current.minDistance = 0.05;
      controls.current.maxDistance = 100;
      // A cabin view may look upward. Exterior limits must not clamp that
      // orientation before interpolation has brought it outside the cabin.
      controls.current.minPolarAngle = 0;
      controls.current.maxPolarAngle = Math.PI;
    }
    wasInterior.current = preset === "interior";
    invalidate();
  }, [
    destination,
    targetFov,
    invalidate,
    camera,
    preset,
    requestId,
    cabinView,
    exteriorPreset,
  ]);

  useEffect(() => {
    // User can deliberately enable rotation again after a drag cancelled it.
    if (autoRotate) manuallyStopped.current = false;
    invalidate();
  }, [autoRotate, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    if (moving.current) {
      const alpha = interpolationAlpha(delta, reducedMotion);
      const lookDistance = camera.position.distanceTo(orbit.target);
      camera.position.lerp(destination.position, alpha);
      if (leavingInterior.current) {
        // A nearby cabin target and a distant exterior target can swing the
        // view abruptly even when their positions lerp. Blend the look rotation
        // itself, then rebuild a matching target for OrbitControls.
        lookTransition.matrix.lookAt(
          camera.position,
          destination.target,
          camera.up,
        );
        lookTransition.rotation.setFromRotationMatrix(lookTransition.matrix);
        camera.quaternion.slerp(lookTransition.rotation, alpha);
        const radius =
          lookDistance +
          (camera.position.distanceTo(destination.target) - lookDistance) *
            alpha;
        orbit.target
          .copy(camera.getWorldDirection(lookTransition.direction))
          .multiplyScalar(radius)
          .add(camera.position);
      } else {
        orbit.target.lerp(destination.target, alpha);
      }
      camera.fov += (targetFov - camera.fov) * alpha;
      camera.updateProjectionMatrix();
      orbit.update();
      if (
        camera.position.distanceToSquared(destination.position) < 0.00001 &&
        orbit.target.distanceToSquared(destination.target) < 0.00001 &&
        Math.abs(camera.fov - targetFov) < 0.01
      ) {
        camera.position.copy(destination.position);
        orbit.target.copy(destination.target);
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
        moving.current = false;
        orbit.minDistance = view.minDistance;
        orbit.maxDistance = destination.maxDistance;
        orbit.minPolarAngle = 0.005;
        orbit.maxPolarAngle = Math.PI / 2 - 0.025;
      }
      invalidate();
    }
    orbit.enableDamping = !reducedMotion && !moving.current;
    orbit.autoRotate =
      preset !== "interior" &&
      autoRotate &&
      !reducedMotion &&
      !moving.current &&
      !manuallyStopped.current;
    if (orbit.autoRotate) invalidate();
  }, -2);

  function stopForManualInput() {
    moving.current = false;
    manuallyStopped.current = true;
    if (controls.current) {
      controls.current.autoRotate = false;
      controls.current.minDistance = view.minDistance;
      controls.current.maxDistance = destination.maxDistance;
      controls.current.minPolarAngle = 0.005;
      controls.current.maxPolarAngle = Math.PI / 2 - 0.025;
    }
    onManual();
  }

  const manualHandler = useRef(stopForManualInput);
  manualHandler.current = stopForManualInput;
  useEffect(() => {
    setViewerAccessibility(gl.domElement, preset === "interior");
    if (preset === "interior" || !controls.current) return;
    return connectExteriorKeyboard({
      canvas: gl.domElement,
      camera,
      controls: controls.current,
      onManual: () => manualHandler.current(),
      invalidate,
      onReset: () => {
        moving.current = true;
        if (controls.current) {
          controls.current.enableDamping = false;
          controls.current.minDistance = 0.05;
          controls.current.maxDistance = 100;
        }
      },
    });
  }, [gl, camera, preset, invalidate]);

  useInteriorLook({
    enabled: preset === "interior",
    seat: destination.position,
    target: destination.target,
    onManual: stopForManualInput,
    contractLook: Boolean(cabinView),
  });

  return (
    <OrbitControls
      enabled={preset !== "interior"}
      ref={controls}
      makeDefault
      regress
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      rotateSpeed={0.6}
      zoomSpeed={0.75}
      autoRotateSpeed={0.45}
      minPolarAngle={0.005}
      maxPolarAngle={Math.PI / 2 - 0.025}
      onStart={stopForManualInput}
    />
  );
}
