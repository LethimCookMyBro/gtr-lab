import { useEffect, useLayoutEffect, useState } from "react";
import { useThree } from "@react-three/fiber";

const MAX_BUFFER_PIXELS = 2_000_000;
const MAX_DPR = 1.5;

export function vehiclePixelRatio(
  width: number,
  height: number,
  nativeDpr: number,
) {
  return Math.min(
    nativeDpr,
    MAX_DPR,
    Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, width * height)),
  );
}

export function initialVehiclePixelRatio() {
  return typeof window === "undefined"
    ? 1
    : vehiclePixelRatio(
        window.innerWidth,
        window.innerHeight,
        window.devicePixelRatio || 1,
      );
}

/** Canvas is the only DPR owner. Camera motion never reallocates its buffer. */
export function VehiclePixelDensity({
  onChange,
}: {
  onChange: (dpr: number) => void;
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
    onChange(vehiclePixelRatio(width, height, nativeDpr));
  }, [width, height, nativeDpr, onChange]);
  return null;
}
