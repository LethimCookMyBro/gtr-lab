import { useEffect, useLayoutEffect, useRef } from "react";
import { Mesh } from "three";
import { useThree } from "@react-three/fiber";
import { compileRearScene } from "../home/compileRearScene";
import { overrideCabinWindows } from "./cabinPreview";
import type { PreparedVehicle } from "./materialAdapter";

type Props = {
  asset: PreparedVehicle;
  exterior: PreparedVehicle;
  active: boolean;
  request: number;
  onReady: (request: number) => void;
  onError: (request: number, message: string) => void;
};
/** Optional cabin owns no canvas, exterior, environment or global loading state. */
export function CabinAttachment({
  asset,
  exterior,
  active,
  request,
  onReady,
  onError,
}: Props) {
  const gl = useThree((state) => state.gl),
    camera = useThree((state) => state.camera),
    scene = useThree((state) => state.scene),
    invalidate = useThree((state) => state.invalidate);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    // The reviewed native cabin does not add shadow passes. The shared vehicle
    // loader's exterior adapter enables them; restore this cabin-only policy.
    asset.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    const timer = window.setTimeout(() => {
      if (!live) return;
      live = false;
      abort.abort();
      callbacks.current.onError(
        request,
        "Cabin rendering took too long. Please retry.",
      );
    }, 30000);
    // Compile with the real environment/lights without mounting the cabin into
    // the visible scene. Exterior remains intact throughout download and setup.
    void compileRearScene(gl, asset.scene, camera, abort.signal, scene)
      .then(() => {
        if (live) callbacks.current.onReady(request);
      })
      .catch((error: unknown) => {
        if (live)
          callbacks.current.onError(
            request,
            error instanceof Error
              ? error.message
              : "Cabin rendering could not be prepared.",
          );
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      live = false;
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [asset, camera, gl, scene, request]);
  useLayoutEffect(() => {
    if (!active) return;
    try {
      const restore = overrideCabinWindows(exterior.scene);
      invalidate();
      return () => {
        restore();
        invalidate();
      };
    } catch (error) {
      callbacks.current.onError(
        request,
        error instanceof Error
          ? error.message
          : "Cabin windows could not be prepared.",
      );
    }
  }, [active, exterior, invalidate, request]);
  if (!active) return null;
  return (
    <group scale={exterior.scale} position={exterior.position} dispose={null}>
      <primitive object={asset.scene} dispose={null} />
    </group>
  );
}
