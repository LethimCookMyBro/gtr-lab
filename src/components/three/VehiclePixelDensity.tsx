import { useEffect, useLayoutEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { RenderQuality } from "./types";

const MAX_BUFFER_PIXELS = 2_000_000;
const MAX_DPR = 1.5;

export function vehiclePixelRatio(
  width: number,
  height: number,
  nativeDpr: number,
  quality: RenderQuality = "standard",
) {
  return Math.min(
    nativeDpr,
    MAX_DPR,
    Math.sqrt(
      (quality === "reduced" ? 1_000_000 : MAX_BUFFER_PIXELS) /
        Math.max(1, width * height),
    ),
  );
}

export function initialVehiclePixelRatio(quality: RenderQuality = "standard") {
  return typeof window === "undefined"
    ? 1
    : vehiclePixelRatio(
        window.innerWidth,
        window.innerHeight,
        window.devicePixelRatio || 1,
        quality,
      );
}

/** Canvas is the only DPR owner. Camera motion never reallocates its buffer. */
export function VehiclePixelDensity({
  onChange,
  quality = "standard",
}: {
  onChange: (dpr: number) => void;
  quality?: RenderQuality;
}) {
  const { width, height } = useThree((state) => state.size);
  const [nativeDpr, setNativeDpr] = useState(
    () => window.devicePixelRatio || 1,
  );
  useEffect(() => {
    const update = () => setNativeDpr(window.devicePixelRatio || 1);
    // Moving to another display may change density without changing CSS size.
    const density = window.matchMedia?.(`(resolution: ${nativeDpr}dppx)`);
    density?.addEventListener("change", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      density?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [nativeDpr]);
  useLayoutEffect(() => {
    onChange(vehiclePixelRatio(width, height, nativeDpr, quality));
  }, [width, height, nativeDpr, quality, onChange]);
  return null;
}
