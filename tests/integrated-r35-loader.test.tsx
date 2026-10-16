// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { URL as NodeURL } from "node:url";
import { Mesh, Texture } from "three";
import { useVehicleAsset } from "../src/components/three/useVehicleAsset";
import { R35_STUDY } from "../src/data/r35IntegratedStudy";

const bytes = readFileSync(
  "public/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb",
);
const gltf = JSON.parse(
  bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(failImage = false) {
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
  let imageIndex = 0;
  vi.stubGlobal(
    "createImageBitmap",
    () =>
      new Promise<Bitmap>((resolve, reject) => {
        const index = imageIndex++;
        if (failImage && index === 0) {
          pending.push(() =>
            reject(new Error("injected image decode failure")),
          );
          return;
        }
        const bitmap = new Bitmap();
        bitmaps.push(bitmap);
        pending.push(() => resolve(bitmap));
      }),
  );
  const originalFetch = globalThis.fetch,
    modelFetch = vi.fn(async () => new Response(bytes));
  vi.stubGlobal("fetch", (url: string) =>
    url.startsWith("blob:") ? originalFetch(url) : modelFetch(),
  );
  const error = vi.fn(),
    progress = vi.fn();
  const hook = renderHook(
    ({ selected, view }) => {
      void view;
      return useVehicleAsset(
        selected ? R35_STUDY.asset.url : null,
        R35_STUDY.asset.materialRoles,
        progress,
        error,
        [],
        undefined,
        false,
        0,
        true,
      );
    },
    { initialProps: { selected: true, view: "exterior" } },
  );
  return { ...hook, bitmaps, pending, modelFetch, error, progress };
}
it("pins the exact private candidate identity", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "a8f6e3e15ab71075f8caf817d362d31be8b7f0f4734f12602ea6348599727585",
  );
});
it("retains all 126 source meshes, 40 materials and exact source IDs through seat changes, then disposes once", async () => {
  const f = fixture();
  await waitFor(() =>
    expect({ images: f.pending.length, errors: f.error.mock.calls }).toEqual({
      images: gltf.images.length,
      errors: [],
    }),
  );
  await act(async () => f.pending.splice(0).forEach((resolve) => resolve()));
  await waitFor(() => expect(f.result.current).not.toBeNull());
  const resident = f.result.current!,
    geometries = new Set<any>(),
    materials = new Set<any>(),
    textures = new Set<Texture>();
  let meshCount = 0;
  resident.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount++;
    const identity = object.userData.gltfSource;
    expect(identity.meshes).toBeTypeOf("number");
    const expectedMaterial =
      gltf.materials[gltf.meshes[identity.meshes].primitives[0].material];
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      expect(material.name).toBe(expectedMaterial.name);
      expect(material.side).toBe(2);
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
    expect(object.layers.mask).toBe(1);
    expect(object.renderOrder).toBe(0);
    expect(object.castShadow).toBe(false);
    expect(object.receiveShadow).toBe(false);
  });
  expect(meshCount).toBe(126);
  expect(materials.size).toBe(40);
  expect(resident.bindings).toEqual([]);
  const disposals = [...geometries, ...materials, ...textures].map((resource) =>
    vi.spyOn(resource, "dispose"),
  );
  for (const view of ["driver", "passenger", "rear", "exterior", "driver"]) {
    f.rerender({ selected: true, view });
    expect(f.result.current).toBe(resident);
  }
  expect(f.modelFetch).toHaveBeenCalledTimes(1);
  for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
  resident.dispose();
  f.unmount();
  resident.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(f.error).not.toHaveBeenCalled();
});
it.each(["selection", "route"])(
  "disposes late decoded resources exactly once after %s cancellation",
  async (reason) => {
    const f = fixture();
    await waitFor(() =>
      expect({ images: f.pending.length, errors: f.error.mock.calls }).toEqual({
        images: gltf.images.length,
        errors: [],
      }),
    );
    if (reason === "selection")
      f.rerender({ selected: false, view: "exterior" });
    else f.unmount();
    await act(async () => f.pending.splice(0).forEach((resolve) => resolve()));
    await waitFor(() =>
      f.bitmaps.forEach((bitmap) =>
        expect(bitmap.close).toHaveBeenCalledTimes(1),
      ),
    );
    expect(f.result.current).toBeNull();
    expect(f.error).not.toHaveBeenCalled();
    expect(f.modelFetch).toHaveBeenCalledTimes(1);
  },
);
it("fails closed and releases successful images when one image decode fails", async () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {}),
    f = fixture(true);
  await waitFor(() =>
    expect({ images: f.pending.length, errors: f.error.mock.calls }).toEqual({
      images: gltf.images.length,
      errors: [],
    }),
  );
  await act(async () => f.pending.splice(0).forEach((resolve) => resolve()));
  await waitFor(() =>
    expect(f.error).toHaveBeenCalledWith(
      expect.stringMatching(/textures.*decoded/i),
    ),
  );
  expect(f.result.current).toBeNull();
  for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  f.unmount();
  for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  quiet.mockRestore();
});
