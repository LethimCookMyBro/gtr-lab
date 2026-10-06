import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

// Bound total render work as well as density: a phone can use a crisp 2x buffer,
// while a large desktop never quietly allocates an unbounded retina framebuffer.
const MAX_BUFFER_PIXELS = 2_500_000;
const REST_DPR = 2;
const MOVING_DPR = 1.25;
const SETTLE_MS = 160;

export function rearRestPixelRatio(
  width: number,
  height: number,
  nativeDpr: number,
) {
  return Math.min(
    nativeDpr,
    REST_DPR,
    Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, width * height)),
  );
}

export function RearPixelDensity({
  progress,
  reducedMotion,
  active = true,
  onChange,
}: {
  progress: number;
  reducedMotion: boolean;
  active?: boolean;
  onChange: (dpr: number) => void;
}) {
  const { width, height } = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const previous = useRef(progress);
  const nativeDpr =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  useLayoutEffect(() => {
    const rest = rearRestPixelRatio(width, height, nativeDpr);
    const moving =
      active &&
      !reducedMotion &&
      previous.current !== progress &&
      progress > 0.02 &&
      progress < 0.98;
    previous.current = progress;
    const apply = (dpr: number, quality: "moving" | "rest") => {
      // Canvas owns DPR. Calling the renderer/store setter here would fight
      // Canvas.configure(), which reapplies its prop on the next scroll update.
      onChange(dpr);
      gl.domElement.dataset.rearQuality = quality;
      gl.domElement.dataset.rearDpr = dpr.toFixed(3);
      // Demand rendering spends one extra frame on idle recovery, never a loop.
      if (active) invalidate();
    };
    apply(
      moving ? Math.min(rest, MOVING_DPR) : rest,
      moving ? "moving" : "rest",
    );
    if (!moving) return;
    const timeout = window.setTimeout(() => apply(rest, "rest"), SETTLE_MS);
    return () => window.clearTimeout(timeout);
  }, [
    active,
    gl,
    height,
    invalidate,
    nativeDpr,
    progress,
    reducedMotion,
    onChange,
    width,
  ]);
  return null;
}
