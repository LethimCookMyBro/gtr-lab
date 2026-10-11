// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { useVehicleAsset } from "../src/components/three/useVehicleAsset";
import { prepareVehicle } from "../src/components/three/materialAdapter";
const roles = { paint: [], headlights: [], taillights: [] };
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps native cabin coordinates and never normalizes cabin-only bounds", () => {
  const source = new Group();
  const mesh = new Mesh(
    new BoxGeometry(10, 20, 30),
    new MeshStandardMaterial(),
  );
  mesh.position.set(40, -50, 60);
  source.add(mesh);
  const cabin = prepareVehicle(source, roles, [], true);
  expect(cabin.scale).toBe(1);
  expect(cabin.position).toEqual([0, 0, 0]);
  const child = cabin.scene.children[0] as Mesh;
  expect(child.position.toArray()).toEqual([40, -50, 60]);
  expect(child.castShadow).toBe(false);
  expect(child.receiveShadow).toBe(false);
  cabin.dispose();
});

it("loads the exact proxy without requesting or decoding any image and disposes its eight batches once", async () => {
  const fixture = gunzipSync(
    readFileSync("qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz"),
  );
  const fetch = vi.fn(async () => new Response(fixture));
  const decode = vi.fn();
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("fetch", fetch);
  const onError = vi.fn();
  const { result, unmount } = renderHook(() =>
    useVehicleAsset(
      "/proxy.glb",
      roles,
      () => {},
      onError,
      [],
      undefined,
      true,
    ),
  );
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(onError).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).not.toHaveBeenCalled();
  const proxy = result.current!;
  expect(proxy.scale).toBe(1);
  expect(proxy.position).toEqual([0, 0, 0]);
  const geometry: ReturnType<typeof vi.spyOn>[] = [],
    material: ReturnType<typeof vi.spyOn>[] = [];
  proxy.scene.traverse((object) => {
    if (object instanceof Mesh) {
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
      geometry.push(vi.spyOn(object.geometry, "dispose"));
      material.push(
        vi.spyOn(object.material as MeshStandardMaterial, "dispose"),
      );
    }
  });
  expect(geometry).toHaveLength(8);
  proxy.dispose();
  unmount();
  for (const dispose of [...geometry, ...material])
    expect(dispose).toHaveBeenCalledTimes(1);
});

it("cancels an old same-URL attempt and reports only its replacement after out-of-order completion", async () => {
  const fixture = gunzipSync(
    readFileSync("qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz"),
  );
  const pending: {
    resolve: (response: Response) => void;
    signal: AbortSignal;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise<Response>((resolve) =>
        pending.push({ resolve, signal: options.signal as AbortSignal }),
      ),
  );
  const error = vi.fn(),
    progress = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ request }) =>
      useVehicleAsset(
        "/proxy.glb",
        roles,
        progress,
        error,
        [],
        undefined,
        true,
        request,
      ),
    { initialProps: { request: 1 } },
  );
  expect(pending).toHaveLength(1);
  rerender({ request: 2 });
  expect(pending).toHaveLength(2);
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[0].resolve(new Response(fixture)));
  expect(result.current).toBeNull();
  await act(async () => pending[1].resolve(new Response(fixture)));
  await waitFor(() => expect(result.current).not.toBeNull());
  const current = result.current;
  rerender({ request: 3 });
  expect(result.current).toBeNull();
  expect(pending[1].signal.aborted).toBe(true);
  expect(error).not.toHaveBeenCalled();
  expect(current).not.toBeNull();
  unmount();
  expect(pending[2].signal.aborted).toBe(true);
  await act(async () => pending[2].resolve(new Response(fixture)));
  expect(error).not.toHaveBeenCalled();
});

it.each([false, true])(
  "releases all ten detailed cabin bitmaps exactly once (cancel during decode: %s)",
  async (cancel) => {
    const { Blob: NodeBlob } = await import("node:buffer");
    const { URL: NodeURL } = await import("node:url");
    const fixture = gunzipSync(
      readFileSync("qa/cabin-preview/r35-cabin-dashboard.glb.gz"),
    );
    class Bitmap {
      width = 1;
      height = 1;
      close = vi.fn();
    }
    const bitmaps: Bitmap[] = [],
      resolves: (() => void)[] = [];
    const fetch = globalThis.fetch;
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("URL", NodeURL);
    vi.stubGlobal("ImageBitmap", Bitmap);
    vi.stubGlobal(
      "createImageBitmap",
      () =>
        new Promise<Bitmap>((resolve) => {
          const bitmap = new Bitmap();
          bitmaps.push(bitmap);
          resolves.push(() => resolve(bitmap));
        }),
    );
    vi.stubGlobal("fetch", (url: string, options?: RequestInit) =>
      url === "/full.glb" ? Promise.resolve(new Response(fixture)) : fetch(url),
    );
    const error = vi.fn();
    const { result, unmount } = renderHook(() =>
      useVehicleAsset("/full.glb", roles, () => {}, error, [], undefined, true),
    );
    await waitFor(() => expect(bitmaps).toHaveLength(10));
    if (cancel) unmount();
    await act(async () => resolves.forEach((resolve) => resolve()));
    if (!cancel) {
      await waitFor(() => expect(result.current).not.toBeNull());
      result.current!.dispose();
      unmount();
    }
    await waitFor(() =>
      bitmaps.forEach((bitmap) =>
        expect(bitmap.close).toHaveBeenCalledTimes(1),
      ),
    );
    expect(error).not.toHaveBeenCalled();
  },
);
