import { Vector2 } from "three";
import type { WebGLRenderer } from "three";

/**
 * Keep the last painted buffer until its replacement tick is admitted. Canvas
 * still owns the requested DPR and logical size; this only batches their native
 * buffer reset. Call commit first in the root's actual useFrame subscriber list.
 */
export function deferDrawingBufferResize(renderer: WebGLRenderer) {
  const setSize = renderer.setSize;
  const setPixelRatio = renderer.setPixelRatio;
  const appliedSize = renderer.getSize(new Vector2());
  let appliedDpr = renderer.getPixelRatio();
  let width = appliedSize.x;
  let height = appliedSize.y;
  let dpr = appliedDpr;
  let stopped = false;

  const queuedSize: typeof setSize = (
    nextWidth,
    nextHeight,
    updateStyle = true,
  ) => {
    if (stopped) return;
    width = nextWidth;
    height = nextHeight;
    // CSS layout can reflect the new viewport while the previous painted
    // native buffer remains intact. updateStyle=false must leave it alone.
    if (updateStyle) {
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
    }
  };
  const queuedPixelRatio: typeof setPixelRatio = (value) => {
    // Match Three's no-op for undefined, including calls from external JS.
    if (stopped) return;
    if (value !== undefined) dpr = value;
  };
  renderer.setSize = queuedSize;
  renderer.setPixelRatio = queuedPixelRatio;

  const hasPendingResize = () =>
    width !== appliedSize.x || height !== appliedSize.y || dpr !== appliedDpr;

  return {
    hasPendingResize,
    commit() {
      if (stopped || renderer.xr.isPresenting || !hasPendingResize()) return;
      // Three r180 updates the same logical size, ratio, native dimensions and
      // viewport as setPixelRatio + setSize, without the obsolete-size reset
      // nested inside setPixelRatio. CSS was handled by each requested setSize.
      renderer.setDrawingBufferSize(width, height, dpr);
      appliedSize.set(width, height);
      appliedDpr = dpr;
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      if (renderer.setSize === queuedSize) renderer.setSize = setSize;
      if (renderer.setPixelRatio === queuedPixelRatio)
        renderer.setPixelRatio = setPixelRatio;
    },
  };
}
