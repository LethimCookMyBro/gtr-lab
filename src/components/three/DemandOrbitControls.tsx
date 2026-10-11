import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as NativeOrbitControls } from "three-stdlib";

type Options = Pick<
  NativeOrbitControls,
  | "enabled"
  | "enablePan"
  | "enableDamping"
  | "dampingFactor"
  | "rotateSpeed"
  | "zoomSpeed"
  | "autoRotateSpeed"
  | "minPolarAngle"
  | "maxPolarAngle"
>;
type Props = Partial<Options> & {
  makeDefault?: boolean;
  onStart?: () => void;
  /** Only CameraRig's synchronous, already-admitted pose update owns this scope. */
  cameraUpdateDepth: RefObject<number>;
};

/** Native controls with producer-owned demand. Nonvisual options do not enter
 * R3F primitive reconciliation. The ordinary -1 updater/damping path is intact. */
export const OrbitControls = forwardRef<NativeOrbitControls, Props>(
  function DemandOrbitControls(
    { makeDefault = false, onStart, cameraUpdateDepth, ...options },
    ref,
  ) {
    const camera = useThree((state) => state.camera),
      gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate),
      get = useThree((state) => state.get),
      set = useThree((state) => state.set);
    // CameraRig's keyboard and released-damping owners use this same canvas.
    // This is intentionally an app bridge, not Drei's arbitrary eventSource API.
    const element = gl.domElement;
    const controls = useMemo(
      () => new NativeOrbitControls(camera),
      [camera, element],
    );
    const current = useRef({ onStart, cameraUpdateDepth });
    current.current = { onStart, cameraUpdateDepth };
    const previousOptions = useRef<{
      owner: NativeOrbitControls;
      values: Partial<Options>;
    } | null>(null);
    useLayoutEffect(() => {
      // Updating only changed options preserves CameraRig's temporary transition
      // limits when an unrelated enabled/damping policy changes.
      const previous =
        previousOptions.current?.owner === controls
          ? previousOptions.current.values
          : {};
      for (const key of Object.keys(options) as (keyof Options)[]) {
        const value = options[key];
        if (value !== undefined && previous[key] !== value)
          Object.assign(controls, { [key]: value });
      }
      previousOptions.current = { owner: controls, values: options };
    });
    useImperativeHandle(ref, () => controls, [controls]);
    useFrame(() => {
      if (controls.enabled) controls.update();
    }, -1);
    useEffect(() => {
      const change = () => {
        if (current.current.cameraUpdateDepth.current === 0) invalidate();
      };
      const start = () => current.current.onStart?.();
      controls.connect(element);
      controls.addEventListener("change", change);
      controls.addEventListener("start", start);
      return () => {
        controls.removeEventListener("change", change);
        controls.removeEventListener("start", start);
        controls.dispose();
      };
    }, [controls, element, invalidate]);
    useEffect(() => {
      if (!makeDefault) return;
      const previous = get().controls;
      set({ controls });
      return () => {
        if (get().controls === controls) set({ controls: previous });
      };
    }, [makeDefault, controls, get, set]);
    return null;
  },
);
