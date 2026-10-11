// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Blob as NodeBlob } from "node:buffer";
import { URL as NodeURL } from "node:url";
import { Mesh, Texture } from "three";
import { useResidentCabinAsset } from "../src/components/three/useResidentCabinAsset";
import {
  CABIN_URL,
  type CabinPreparationState,
} from "../src/components/three/cabinPreview";
import type { HomeSceneLoadState } from "../src/components/home/homeReadiness";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const compressed = readFileSync(
      "qa/cabin-preview/r35-cabin-dashboard.glb.gz",
    ),
    bytes = gunzipSync(compressed);
  class Bitmap {
    width = 1;
    height = 1;
    close = vi.fn();
  }
  const bitmaps: Bitmap[] = [],
    pending: (() => void)[] = [];
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("URL", NodeURL);
  vi.stubGlobal("ImageBitmap", Bitmap);
  vi.stubGlobal(
    "createImageBitmap",
    () =>
      new Promise<Bitmap>((resolve) => {
        const bitmap = new Bitmap();
        bitmaps.push(bitmap);
        pending.push(() => resolve(bitmap));
      }),
  );
  const originalFetch = globalThis.fetch,
    modelFetch = vi.fn(
      async () =>
        new Response(bytes, {
          headers: {
            "content-encoding": "gzip",
            "content-length": String(compressed.length),
          },
        }),
    );
  vi.stubGlobal("fetch", (url: string, options?: RequestInit) =>
    url === CABIN_URL ? modelFetch() : originalFetch(url),
  );
  return { bitmaps, pending, modelFetch, bytes };
}
it("retains exact real cabin geometry/maps/bitmaps across ready, exit and reentry, then retires once", async () => {
  const f = fixture(),
    error = vi.fn(),
    progress: HomeSceneLoadState[] = [];
  const { result, rerender, unmount } = renderHook(
    ({
      preparation,
      view,
    }: {
      preparation: CabinPreparationState;
      view: string;
    }) => {
      void view;
      return useResidentCabinAsset(preparation, error, (_request, state) =>
        progress.push(state),
      );
    },
    {
      initialProps: {
        preparation: {
          phase: "loading",
          request: 4,
          progress: { phase: "preparing" },
        } as CabinPreparationState,
        view: "exterior",
      },
    },
  );
  await waitFor(() => expect(f.bitmaps).toHaveLength(10));
  await act(async () => f.pending.splice(0).forEach((resolve) => resolve()));
  await waitFor(() => expect(result.current).not.toBeNull());
  const resident = result.current!;
  const geometries = new Set<any>(),
    materials = new Set<any>(),
    textures = new Set<Texture>();
  resident.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  const disposals = [...geometries, ...materials, ...textures].map((resource) =>
    vi.spyOn(resource, "dispose"),
  );
  for (const view of [
    "driver",
    "exterior",
    "driver",
    "passenger",
    "exterior",
  ]) {
    rerender({ preparation: { phase: "ready", request: 4 }, view });
    expect(result.current).toBe(resident);
  }
  expect(f.modelFetch).toHaveBeenCalledTimes(1);
  expect(f.bitmaps).toHaveLength(10);
  for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
  for (const bitmap of f.bitmaps) expect(bitmap.close).not.toHaveBeenCalled();
  const downloaded = progress.filter((state) => state.phase === "downloading");
  expect(downloaded.at(-1)).toEqual({
    phase: "downloading",
    loadedBytes: f.bytes.length,
    totalBytes: undefined,
  });
  unmount();
  resident.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
it("retires a decode cancelled by route navigation and never reports the old generation ready", async () => {
  const f = fixture(),
    error = vi.fn(),
    progress = vi.fn();
  const { result, rerender } = renderHook(
    ({ preparation }: { preparation?: CabinPreparationState }) =>
      useResidentCabinAsset(preparation, error, progress),
    {
      initialProps: {
        preparation: {
          phase: "loading",
          request: 7,
          progress: { phase: "preparing" },
        } as CabinPreparationState | undefined,
      },
    },
  );
  await waitFor(() => expect(f.bitmaps).toHaveLength(10));
  rerender({ preparation: undefined });
  await act(async () => f.pending.splice(0).forEach((resolve) => resolve()));
  await waitFor(() =>
    f.bitmaps.forEach((bitmap) =>
      expect(bitmap.close).toHaveBeenCalledTimes(1),
    ),
  );
  expect(result.current).toBeNull();
  expect(f.modelFetch).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
  expect(
    progress.mock.calls.some(
      ([_request, state]) => state.phase === "preparing",
    ),
  ).toBe(false);
});
