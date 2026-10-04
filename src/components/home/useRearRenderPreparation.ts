import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { compileRearScene } from "./compileRearScene";

/** Compilation alone is insufficient: observe a completed real renderer frame too. */
export function useRearRenderPreparation(
  onReady: () => void,
  onError: (message: string) => void,
) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const status = useRef({
    live: true,
    abort: new AbortController(),
    compiled: false,
    renderedAfter: -1,
    ready: false,
    failed: false,
  });
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useLayoutEffect(() => {
    const current = {
      live: true,
      abort: new AbortController(),
      compiled: false,
      renderedAfter: -1,
      ready: false,
      failed: false,
    };
    status.current = current;
    const previousShaderError = gl.debug?.onShaderError;
    const failedShader: NonNullable<typeof previousShaderError> = (...args) => {
      if (current.live && !current.failed) {
        current.failed = true;
        current.abort.abort();
        callbacks.current.onError(
          "The 3D shaders could not be compiled. Please retry.",
        );
      }
      // Preserve existing diagnostics without letting an observer bypass recovery.
      try {
        previousShaderError?.(...args);
      } catch {
        /* failure already reported */
      }
    };
    if (gl.debug) gl.debug.onShaderError = failedShader;
    return () => {
      current.live = false;
      current.abort.abort();
      if (gl.debug?.onShaderError === failedShader)
        gl.debug.onShaderError = previousShaderError ?? null;
    };
  }, [gl, scene, camera, invalidate]);
  useEffect(() => {
    const current = status.current;
    if (current.failed || !current.live) return;
    // This runs after the vehicle material effect. Three waits for parallel shader
    // compilation; the later renderer frame also uploads the decoded textures.
    void Promise.resolve()
      .then(() => {
        if (!current.live || current.failed) return;
        return compileRearScene(gl, scene, camera, current.abort.signal);
      })
      .then(() => {
        if (!current.live || current.failed) return;
        current.compiled = true;
        invalidate();
      })
      .catch((error) => {
        if (current.live && !current.failed) {
          current.failed = true;
          callbacks.current.onError(
            error instanceof Error
              ? error.message
              : "The 3D shaders could not be prepared.",
          );
        }
      });
  }, [gl, scene, camera, invalidate]);
  useFrame(() => {
    const current = status.current;
    if (!current.live || current.failed || !current.compiled || current.ready)
      return;
    if (current.renderedAfter < 0) current.renderedAfter = gl.info.render.frame;
    else if (gl.info.render.frame > current.renderedAfter) {
      current.ready = true;
      callbacks.current.onReady();
      return;
    }
    invalidate();
  });
}
