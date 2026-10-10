// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createHash } from "node:crypto";
import manifest from "../modeldata/manifest.json";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Blob as NodeBlob } from "node:buffer";
import { URL as NodeURL } from "node:url";
import { useVehicleAsset } from "../src/components/three/useVehicleAsset";
import type { HomeSceneLoadState } from "../src/components/home/homeReadiness";
// Reconstruct the checksum-pinned published fixture entirely from tracked chunks.
const model = manifest.find((entry) => entry.id === "ciasny-r35")!;
const bytes = new Uint8Array(
  Buffer.concat(
    model.chunks.map((chunk) => {
      const buffer = readFileSync(`modeldata/${chunk.path}`);
      if (createHash("sha256").update(buffer).digest("hex") !== chunk.sha256)
        throw new Error("Invalid model fixture chunk");
      return buffer;
    }),
  ),
);
if (
  bytes.byteLength !== model.bytes ||
  createHash("sha256").update(bytes).digest("hex") !== model.sha256
)
  throw new Error("Invalid model fixture");
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["exterior", "cabin"])(
  "rejects the real %s model if its embedded textures fail decoding even when GLTFLoader returns geometry",
  async (asset) => {
    const fixture =
      asset === "cabin"
        ? gunzipSync(readFileSync("qa/cabin-preview/r35-cabin-realism.glb.gz"))
        : bytes;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("URL", NodeURL);
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("createImageBitmap", () =>
      Promise.reject(new Error("Texture decode failed")),
    );
    vi.stubGlobal("fetch", (url: string, options?: RequestInit) =>
      url === "/car.glb"
        ? Promise.resolve(new Response(fixture))
        : originalFetch(url, options),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: string[] = [];
    const states: HomeSceneLoadState[] = [];
    const { result } = renderHook(() =>
      useVehicleAsset(
        "/car.glb",
        { paint: [], headlights: [], taillights: [] },
        () => {},
        (message) => errors.push(message),
        [],
        (state) => states.push(state),
      ),
    );
    await waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0]).toMatch(/texture/i);
    expect(result.current).toBeNull();
    expect(states.some((state) => state.phase === "preparing")).toBe(false);
  },
);

it.each([
  [{ "content-length": "100" }, 100],
  [{}, undefined],
  [{ "content-length": "30", "content-encoding": "gzip" }, undefined],
] as const)(
  "reports actual streamed bytes and only a trustworthy Content-Length %j",
  async (headers, expectedTotal) => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const states: HomeSceneLoadState[] = [];
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream = controller;
            },
          }),
          { headers },
        ),
    );
    const { unmount } = renderHook(() =>
      useVehicleAsset(
        "/stream.glb",
        { paint: [], headlights: [], taillights: [] },
        () => {},
        () => {},
        [],
        (state) => states.push(state),
      ),
    );
    await waitFor(() => expect(stream).toBeDefined());
    stream.enqueue(bytes.slice(0, 64));
    await waitFor(() =>
      expect(states.at(-1)).toEqual({
        phase: "downloading",
        loadedBytes: 64,
        totalBytes: expectedTotal,
      }),
    );
    expect(
      states.some(
        (state) => state.phase === "ready" || state.phase === "preparing",
      ),
    ).toBe(false);
    unmount();
    stream.close();
  },
);

it("does not fetch or initialize loading for a disabled optional asset", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const progress = vi.fn();
  const { result } = renderHook(() =>
    useVehicleAsset(
      null,
      { paint: [], headlights: [], taillights: [] },
      progress,
      () => {},
    ),
  );
  expect(result.current).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
});
