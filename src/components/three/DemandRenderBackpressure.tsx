import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { installDemandRenderBackpressure } from "./demandFrameAdmission";
import { deferDrawingBufferResize } from "./demandBufferResize";

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
  const resize = useRef<ReturnType<typeof deferDrawingBufferResize> | null>(
    null,
  );
  useFrame(() => resize.current?.commit(), -Infinity);
  useLayoutEffect(() => {
    const state = get();
    const owner = deferDrawingBufferResize(state.gl);
    // A replay/replacement can inherit a newer store size than the last
    // committed buffer. Recover that request without resetting it on mount.
    state.gl.setPixelRatio(state.viewport.dpr);
    state.gl.setSize(state.size.width, state.size.height);
    resize.current = owner;
    if (owner.hasPendingResize()) state.invalidate();
    const release = installDemandRenderBackpressure(
      get,
      (message) => callbacks.current.onError(message),
      (pending) => callbacks.current.onPendingChange?.(pending),
    );
    return () => {
      release();
      resize.current = null;
      owner.dispose();
    };
  }, [get]);
  return null;
}
