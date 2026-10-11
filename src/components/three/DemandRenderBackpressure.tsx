import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { installDemandRenderBackpressure } from "./demandFrameAdmission";

/** Own admission for the lifetime of this Canvas, including StrictMode replay. */
export function DemandRenderBackpressure({
  onError,
  onPendingChange,
}: {
  onError: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const get = useThree((state) => state.get);
  const callbacks = useRef({ onError, onPendingChange });
  callbacks.current = { onError, onPendingChange };
  useLayoutEffect(
    () =>
      installDemandRenderBackpressure(
        get,
        (message) => callbacks.current.onError(message),
        (pending) => callbacks.current.onPendingChange?.(pending),
      ),
    [get],
  );
  return null;
}
