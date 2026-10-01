import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { interiorLookTarget } from "./sceneHelpers";
import type { VectorTuple } from "./sceneHelpers";

type Props = {
  enabled: boolean;
  seat: Vector3;
  target: Vector3;
  onManual: () => void;
};

/** Drag or arrow keys rotate the view around a fixed driver's eye point. */
export function useInteriorLook({ enabled, seat, target, onManual }: Props) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  const onManualRef = useRef(onManual);
  onManualRef.current = onManual;
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const direction = target.clone().sub(seat).normalize();
    let yaw = Math.atan2(direction.x, direction.z);
    let pitch = Math.asin(direction.y);
    let pointer: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const previousTabIndex = canvas.tabIndex;
    canvas.tabIndex = 0;
    function apply() {
      onManualRef.current();
      camera.position.copy(seat);
      camera.lookAt(
        ...interiorLookTarget(seat.toArray() as VectorTuple, yaw, pitch),
      );
      camera.updateProjectionMatrix();
      invalidate();
    }
    function down(event: PointerEvent) {
      if (pointer !== null) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(pointer);
      canvas.focus({ preventScroll: true });
      apply();
    }
    function move(event: PointerEvent) {
      if (event.pointerId !== pointer) return;
      yaw = MathUtils.clamp(
        yaw - (event.clientX - lastX) * 0.004,
        -Math.PI * 0.95,
        Math.PI * 0.95,
      );
      pitch = MathUtils.clamp(
        pitch + (event.clientY - lastY) * 0.003,
        -0.65,
        0.65,
      );
      lastX = event.clientX;
      lastY = event.clientY;
      apply();
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== pointer) return;
      if (canvas.hasPointerCapture(pointer))
        canvas.releasePointerCapture(pointer);
      pointer = null;
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      camera.fov = MathUtils.clamp(camera.fov + event.deltaY * 0.025, 45, 85);
      apply();
    }
    function key(event: KeyboardEvent) {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      yaw = MathUtils.clamp(
        yaw +
          (event.key === "ArrowLeft"
            ? 0.08
            : event.key === "ArrowRight"
              ? -0.08
              : 0),
        -Math.PI * 0.95,
        Math.PI * 0.95,
      );
      pitch = MathUtils.clamp(
        pitch +
          (event.key === "ArrowUp"
            ? 0.06
            : event.key === "ArrowDown"
              ? -0.06
              : 0),
        -0.65,
        0.65,
      );
      apply();
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
      canvas.tabIndex = previousTabIndex;
    };
  }, [enabled, seat, target, camera, gl, invalidate]);
}
