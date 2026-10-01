import { useEffect, useRef, useState } from "react";
import { createVehicleLoader } from "./createVehicleLoader";
import { disposeVehicleObject, prepareVehicle } from "./materialAdapter";
import type { PreparedVehicle } from "./materialAdapter";
import type { MaterialRoles } from "./sceneHelpers";
import { progressPercent } from "./sceneHelpers";

const MAX_MODEL_BYTES = 120 * 1024 * 1024;

/** Streaming fetch allows genuine byte progress and route-change cancellation. */
async function readModel(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`The model could not be loaded (HTTP ${response.status}).`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (total > MAX_MODEL_BYTES)
    throw new Error("This model exceeds the 120 MB viewer limit.");
  if (!response.body) return response.arrayBuffer();
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
  url: string,
  roles: MaterialRoles,
  onProgress: (value: number) => void,
  onError: (message: string) => void,
  disabledEmissive: string[] = [],
) {
  const [asset, setAsset] = useState<PreparedVehicle | null>(null);
  const callbacks = useRef({ onProgress, onError });
  callbacks.current = { onProgress, onError };
  const rolesKey = JSON.stringify(roles);
  const disabledEmissiveKey = JSON.stringify(disabledEmissive);
  useEffect(() => {
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
    const loader = createVehicleLoader();
    void readModel(url, abort.signal, (progress) => {
      if (live) callbacks.current.onProgress(progress);
    })
      .then((buffer) =>
        loader.parseAsync(
          buffer,
          url.startsWith("blob:") ? "" : url.slice(0, url.lastIndexOf("/") + 1),
        ),
      )
      .then((gltf) => {
        if (!live || abort.signal.aborted) {
          disposeVehicleObject(gltf.scene);
          return;
        }
        try {
          owned = prepareVehicle(
            gltf.scene,
            JSON.parse(rolesKey) as MaterialRoles,
            JSON.parse(disabledEmissiveKey) as string[],
          );
          callbacks.current.onProgress(99);
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
