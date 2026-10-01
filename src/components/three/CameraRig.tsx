import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PerspectiveCamera, Vector3 } from "three";
import {
  cameraView,
  interpolationAlpha,
  type CameraView,
} from "./sceneHelpers";
import { useInteriorLook } from "./useInteriorLook";
import {
  connectExteriorKeyboard,
  setViewerAccessibility,
} from "./keyboardControls";

type Props = {
  preset: string;
  autoRotate: boolean;
  reducedMotion: boolean;
  onManual: () => void;
  cameraViews?: Partial<Record<string, CameraView>>;
};

export function CameraRig({
  preset,
  autoRotate,
  reducedMotion,
  onManual,
  cameraViews,
}: Props) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const controls = useRef<OrbitControlsImpl>(null);
  const moving = useRef(true);
  const manuallyStopped = useRef(false);
  const view = cameraView(preset, cameraViews);
  const aspect = size.width / Math.max(1, size.height);
  const destination = useMemo(() => {
    const target = new Vector3(...view.target);
    const position = new Vector3(...view.position);
    // Preserve whole-car framing on portrait screens; detail views remain close.
    const distanceScale =
      preset === "wheel" || preset === "interior"
        ? 1
        : Math.min(2.2, Math.max(1, 1.2 / aspect));
    position.sub(target).multiplyScalar(distanceScale).add(target);
    return { target, position, maxDistance: view.maxDistance * distanceScale };
  }, [aspect, preset, view]);

  useEffect(() => {
    moving.current = true;
    manuallyStopped.current = false;
    if (controls.current) {
      controls.current.autoRotate = false;
      controls.current.enableDamping = false;
      controls.current.minDistance = 0.05;
      controls.current.maxDistance = 100;
    }
    invalidate();
  }, [destination, view.fov, invalidate]);

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
      camera.position.lerp(destination.position, alpha);
      orbit.target.lerp(destination.target, alpha);
      camera.fov += (view.fov - camera.fov) * alpha;
      camera.updateProjectionMatrix();
      orbit.update();
      if (
        camera.position.distanceToSquared(destination.position) < 0.00001 &&
        orbit.target.distanceToSquared(destination.target) < 0.00001 &&
        Math.abs(camera.fov - view.fov) < 0.01
      ) {
        camera.position.copy(destination.position);
        orbit.target.copy(destination.target);
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
        moving.current = false;
        orbit.minDistance = view.minDistance;
        orbit.maxDistance = destination.maxDistance;
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
