import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mesh } from "three";
import { useThree } from "@react-three/fiber";
import { compileRearScene } from "../home/compileRearScene";
import { createCabinWindowOwner, type CabinWindowStatus } from "./cabinPreview";
import { invalidateSceneShadows } from "./staticShadowPolicy";
import { configureCabinLayers } from "./stageLayers";
import {
  registerVehicleRestoration,
  type PreparedVehicle,
} from "./materialAdapter";

type Props = {
  asset: PreparedVehicle | null;
  exterior: PreparedVehicle;
  active: boolean;
  prepared?: boolean;
  request: number;
  onReady: (request: number) => void;
  onError: (request: number, message: string) => void;
  proxy?: PreparedVehicle | null;
  proxyFailed?: boolean;
  onProxyError?: () => void;
  onOwnerError?: (message: string) => void;
  onWindowStatus?: (status: CabinWindowStatus) => void;
};

/** Own a cancellable compile barrier for one exact asset and request. */
function useCabinCompilation(
  asset: PreparedVehicle | null,
  request: number,
  onReady: (request: number) => void,
  onError: (request: number, message: string) => void,
) {
  const gl = useThree((state) => state.gl),
    camera = useThree((state) => state.camera),
    scene = useThree((state) => state.scene);
  const [compiled, setCompiled] = useState<{
    asset: PreparedVehicle;
    request: number;
    gl: typeof gl;
    camera: typeof camera;
    scene: typeof scene;
  } | null>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    // This component persists while the full cabin is closed; drop disposed CPU
    // scene references as well as cancelling its native compilation/resources.
    setCompiled(null);
    if (!asset) return;
    // Establish main-view/contact-depth ownership before compilation or mount.
    configureCabinLayers(asset.scene, camera);
    let live = true;
    const abort = new AbortController();
    // Explicitly preserve the reviewed no-shadow policy before compilation.
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
    void compileRearScene(
      gl,
      asset.scene,
      camera,
      abort.signal,
      scene,
      "object",
    )
      .then(() => {
        if (!live) return;
        setCompiled({ asset, request, gl, camera, scene });
        callbacks.current.onReady(request);
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
  return (
    !!asset &&
    compiled?.asset === asset &&
    compiled.request === request &&
    compiled.gl === gl &&
    compiled.camera === camera &&
    compiled.scene === scene
  );
}

/** One persistent glass owner and one cabin representation in each React commit. */
export function CabinAttachment({
  asset,
  exterior,
  active,
  prepared,
  request,
  onReady,
  onError,
  proxy = null,
  proxyFailed = false,
  onProxyError,
  onOwnerError,
  onWindowStatus,
}: Props) {
  const scene = useThree((state) => state.scene),
    invalidate = useThree((state) => state.invalidate);
  const callbacks = useRef({
    onError,
    onProxyError,
    onWindowStatus,
    onOwnerError,
  });
  callbacks.current = { onError, onProxyError, onWindowStatus, onOwnerError };
  const owner = useRef<ReturnType<typeof createCabinWindowOwner> | null>(null);
  const compiledReady = useCabinCompilation(
    prepared === undefined ? asset : null,
    request,
    (readyRequest) => {
      if (owner.current) onReady(readyRequest);
      else
        onError(
          readyRequest,
          "The cabin window roles could not be verified. Return to the exterior and retry.",
        );
    },
    onError,
  );
  const fullReady = prepared ?? compiledReady;
  const proxyReady = useCabinCompilation(
    proxy,
    0,
    () => {},
    () => callbacks.current.onProxyError?.(),
  );
  const [windows, setWindows] = useState<PreparedVehicle | null>(null);
  useLayoutEffect(() => {
    try {
      const current = createCabinWindowOwner(exterior.scene);
      const unregister = registerVehicleRestoration(exterior.scene, () =>
        current.dispose(),
      );
      owner.current = current;
      setWindows(exterior);
      return () => {
        current.dispose();
        unregister();
        if (owner.current === current) owner.current = null;
        invalidateSceneShadows(scene);
        invalidate();
      };
    } catch {
      callbacks.current.onProxyError?.();
      callbacks.current.onOwnerError?.(
        "The cabin window roles could not be verified. Please retry the viewer.",
      );
    }
  }, [exterior, scene, invalidate]);
  const selected =
    windows === exterior
      ? active && fullReady
        ? asset
        : proxyReady && !proxyFailed
          ? proxy
          : null
      : null;
  useLayoutEffect(() => {
    if (owner.current?.setTransparent(!!selected))
      invalidateSceneShadows(scene);
    invalidate();
  }, [selected, exterior, scene, invalidate]);
  useEffect(() => {
    callbacks.current.onWindowStatus?.(
      proxyFailed
        ? "unavailable"
        : proxyReady && windows === exterior
          ? "ready"
          : "loading",
    );
  }, [proxyReady, proxyFailed, windows, exterior]);
  if (!selected) return null;
  return (
    <group scale={exterior.scale} position={exterior.position} dispose={null}>
      <primitive
        key={selected.scene.uuid}
        object={selected.scene}
        dispose={null}
      />
    </group>
  );
}
