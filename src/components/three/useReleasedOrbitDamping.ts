import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls } from "three-stdlib";
import { createReleasedOrbitDamping } from "./releasedOrbitDamping";

type Options = {
  controls: RefObject<OrbitControls | null>;
  moving: RefObject<boolean>;
  exterior: boolean;
  reducedMotion: boolean;
  autoRotate: boolean;
  preset: string;
  requestId: number;
};

/** Compensate only a released exterior orbit on slow frames. The installed Drei
 * callback at -1 remains the sole frame updater. Do not add a controls.update()
 * caller between the -1.5 arm and -1 consumption callbacks. Native event calls
 * cannot interleave this synchronous R3F subscriber sequence. */
export function useReleasedOrbitDamping(options: Options) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);
  const latest = useRef(options);
  latest.current = options;
  const owner = useRef<ReturnType<typeof createReleasedOrbitDamping> | null>(
    null,
  );
  const held = useRef(new Set<number>());
  const now = () => performance.now() / 1000;

  useLayoutEffect(() => {
    const controls = options.controls.current;
    if (!controls) return;
    const adapter = createReleasedOrbitDamping(controls);
    owner.current = adapter;
    const document = canvas.ownerDocument;
    const window = document.defaultView;
    const reset = () => {
      held.current.clear();
      adapter.reset();
    };
    const boundary = () => adapter.inputBoundary(now());
    const down = (event: PointerEvent) => {
      const props = latest.current;
      const modified = event.ctrlKey || event.metaKey || event.shiftKey;
      const action =
        event.button === 0
          ? controls.mouseButtons.LEFT
          : event.button === 1
            ? controls.mouseButtons.MIDDLE
            : event.button === 2
              ? controls.mouseButtons.RIGHT
              : undefined;
      const mouseOrbit =
        (action === MOUSE.ROTATE && !modified) ||
        (action === MOUSE.PAN && modified);
      // The app's one-finger touch mode is ROTATE. Track all additional fingers
      // as held blockers, including the two-finger dolly mode; never treat one
      // finger's end as a fully released gesture. Unsupported ONE mappings are
      // left entirely on native damping instead of guessing another gesture.
      const touchOrbit =
        event.pointerType === "touch" && controls.touches.ONE === TOUCH.ROTATE;
      const accepted =
        props.exterior &&
        !props.reducedMotion &&
        controls.enabled &&
        controls.enableRotate &&
        (event.pointerType === "touch" ? touchOrbit : mouseOrbit);
      if (!accepted) {
        boundary();
        return;
      }
      held.current.add(event.pointerId);
      adapter.pointerDown(event.pointerId, now());
    };
    const up = (event: PointerEvent) => {
      held.current.delete(event.pointerId);
      adapter.pointerUp(event.pointerId, now());
    };
    const lost = (event: PointerEvent) => {
      // A normal pointerup releases capture after our document-capture handler.
      // Do not cancel the newly released epoch for that expected lost event.
      if (held.current.has(event.pointerId)) reset();
    };
    const key = (event: KeyboardEvent) => {
      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "_",
          "Home",
        ].includes(event.key)
      )
        boundary();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    canvas.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", reset, true);
    canvas.addEventListener("lostpointercapture", lost, true);
    canvas.addEventListener("wheel", boundary, {
      capture: true,
      passive: true,
    });
    canvas.addEventListener("keydown", key, true);
    window?.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", reset, true);
      canvas.removeEventListener("lostpointercapture", lost, true);
      canvas.removeEventListener("wheel", boundary, true);
      canvas.removeEventListener("keydown", key, true);
      window?.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      held.current.clear();
      adapter.dispose();
      if (owner.current === adapter) owner.current = null;
    };
  }, [canvas, camera, options.controls]);

  useLayoutEffect(() => {
    held.current.clear();
    owner.current?.reset();
  }, [
    options.exterior,
    options.reducedMotion,
    options.preset,
    options.requestId,
  ]);
  useLayoutEffect(() => {
    // Manual dragging turns auto-rotate off; keep that held pointer tracked.
    owner.current?.inputBoundary(now());
  }, [options.autoRotate]);

  useFrame(() => {
    const props = latest.current;
    owner.current?.arm(now(), {
      exterior: props.exterior,
      moving: props.moving.current,
      reducedMotion: props.reducedMotion,
    });
  }, -1.5);
  useFrame(() => {
    owner.current?.clear();
  }, -0.5);
}
