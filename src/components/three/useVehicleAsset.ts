import { useEffect, useRef, useState } from "react";
import { LoadingManager } from "three";
import { createVehicleLoader } from "./createVehicleLoader";
import { disposeVehicleObject, prepareVehicle } from "./materialAdapter";
import type { PreparedVehicle } from "./materialAdapter";
import type { MaterialRoles } from "./sceneHelpers";
import { progressPercent } from "./sceneHelpers";

import type { HomeSceneLoadState } from "../home/homeReadiness";

const MAX_MODEL_BYTES = 120 * 1024 * 1024;

/** Streaming fetch allows genuine byte progress and route-change cancellation. */
async function readModel(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
  onLoadState?: (state: HomeSceneLoadState) => void,
) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`The model could not be loaded (HTTP ${response.status}).`);
  // Compressed Content-Length describes wire bytes, not decoded stream bytes.
  const encoding = response.headers.get("content-encoding");
  const total =
    !encoding || encoding === "identity"
      ? Number(response.headers.get("content-length")) || 0
      : 0;
  onLoadState?.({
    phase: "downloading",
    loadedBytes: 0,
    totalBytes: total || undefined,
  });
  if (total > MAX_MODEL_BYTES)
    throw new Error("This model exceeds the 120 MB viewer limit.");
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_MODEL_BYTES)
      throw new Error("This model exceeds the 120 MB viewer limit.");
    onLoadState?.({
      phase: "downloading",
      loadedBytes: buffer.byteLength,
      totalBytes: total || undefined,
    });
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_MODEL_BYTES)
        throw new Error("This model exceeds the 120 MB viewer limit.");
      chunks.push(value);
      onProgress(progressPercent(received, total));
      onLoadState?.({
        phase: "downloading",
        loadedBytes: received,
        totalBytes: total >= received ? total : undefined,
      });
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // A static SPA server may return index.html with status 200 for a missing asset.
  if (
    received < 12 ||
    new DataView(bytes.buffer).getUint32(0, true) !== 0x46546c67
  ) {
    throw new Error(
      "The supplied file is not a valid binary glTF (.glb) model.",
    );
  }
  return bytes.buffer;
}

export function useVehicleAsset(
  url: string | null,
  roles: MaterialRoles,
  onProgress: (value: number) => void,
  onError: (message: string) => void,
  disabledEmissive: string[] = [],
  onLoadState?: (state: HomeSceneLoadState) => void,
) {
  const [asset, setAsset] = useState<PreparedVehicle | null>(null);
  const callbacks = useRef({ onProgress, onError, onLoadState });
  callbacks.current = { onProgress, onError, onLoadState };
  const rolesKey = JSON.stringify(roles);
  const disabledEmissiveKey = JSON.stringify(disabledEmissive);
  useEffect(() => {
    if (!url) {
      setAsset(null);
      return;
    }
    let live = true;
    let owned: PreparedVehicle | undefined;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => {
      abort.abort();
      if (live)
        callbacks.current.onError(
          "The model took too long to load. Please retry.",
        );
    }, 45000);
    setAsset(null);
    callbacks.current.onProgress(0);
    callbacks.current.onLoadState?.({ phase: "downloading", loadedBytes: 0 });
    // GLTFLoader deliberately catches texture errors and can resolve geometry
    // without its maps. Capture failures on this attempt's own manager.
    const manager = new LoadingManager();
    let failedResource = false;
    manager.onError = () => {
      failedResource = true;
    };
    const loader = createVehicleLoader(manager);
    void readModel(
      url,
      abort.signal,
      (progress) => {
        if (live) callbacks.current.onProgress(progress);
      },
      (state) => {
        if (live && !abort.signal.aborted)
          callbacks.current.onLoadState?.(state);
      },
    )
      .then((buffer) => {
        if (!live || abort.signal.aborted) return null;
        callbacks.current.onLoadState?.({ phase: "decoding" });
        return loader.parseAsync(
          buffer,
          url.startsWith("blob:") ? "" : url.slice(0, url.lastIndexOf("/") + 1),
        );
      })
      .then(async (gltf) => {
        if (!gltf) return;
        if (!live || abort.signal.aborted) {
          disposeVehicleObject(gltf.scene);
          return;
        }
        try {
          const textures = await gltf.parser.getDependencies("texture");
          // Blob construction and image decode can both be swallowed to null by
          // GLTFLoader, before or after LoadingManager gets a chance to report.
          if (failedResource || textures.some((texture: unknown) => !texture))
            throw new Error(
              "The model textures could not be decoded. Please retry.",
            );
          if (!live || abort.signal.aborted) {
            disposeVehicleObject(gltf.scene);
            return;
          }
          owned = prepareVehicle(
            gltf.scene,
            JSON.parse(rolesKey) as MaterialRoles,
            JSON.parse(disabledEmissiveKey) as string[],
          );
          callbacks.current.onProgress(99);
          callbacks.current.onLoadState?.({ phase: "preparing" });
          setAsset(owned);
        } catch (error) {
          disposeVehicleObject(gltf.scene);
          throw error;
        }
      })
      .catch((error) => {
        if (live && !abort.signal.aborted)
          callbacks.current.onError(
            error instanceof Error
              ? error.message
              : "This model could not be decoded.",
          );
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      live = false;
      abort.abort();
      window.clearTimeout(timeout);
      owned?.dispose();
    };
  }, [url, rolesKey, disabledEmissiveKey]);
  return asset;
}
