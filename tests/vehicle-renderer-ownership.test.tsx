// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BoxGeometry, Mesh, MeshStandardMaterial, Texture } from "three";
import VehicleScene from "../src/components/three/VehicleScene";
import { prepareVehicle } from "../src/components/three/materialAdapter";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";
import {
  CABIN_PROXY_URL,
  CABIN_URL,
} from "../src/components/three/cabinPreview";
import { textureAllocation } from "./helpers/three-texture-allocation";

const host = vi.hoisted(() => ({
  onCreated: null as ((state: { gl: unknown }) => void) | null,
  exterior: null as PreparedVehicle | null,
  cabin: null as PreparedVehicle | null,
  proxy: null as PreparedVehicle | null,
  urls: [] as (string | null)[],
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: (props: { onCreated: typeof host.onCreated }) => {
    host.onCreated = props.onCreated;
    return null;
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: (url: string | null) => {
    host.urls.push(url);
    return url === "/exterior.glb"
      ? host.exterior
      : url?.includes("exterior-cabin-proxy")
        ? host.proxy
        : url
          ? host.cabin
          : null;
  },
}));
afterEach(() => {
  cleanup();
  host.exterior = host.cabin = host.proxy = null;
  host.urls = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["active", "closed"] as const)(
  "releases the latest exterior and %s resident cabin textures before renderer caches, then permits late owner cleanup",
  async (phase) => {
    vi.useFakeTimers();
    class Bitmap {
      width = 1;
      height = 1;
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", Bitmap);
    const allocation = textureAllocation();
    const bitmaps: Bitmap[] = [];
    const asset = () => {
      const bitmap = new Bitmap();
      bitmaps.push(bitmap);
      const texture = new Texture(bitmap);
      const prepared = prepareVehicle(
        new Mesh(
          new BoxGeometry(),
          new MeshStandardMaterial({
            map: texture,
            roughnessMap: texture,
            metalnessMap: texture,
          }),
        ),
        { paint: [], headlights: [], taillights: [] },
      );
      allocation.upload(texture);
      return prepared;
    };
    const sync = {};
    const context = {
      isContextLost: () => false,
      fenceSync: () => sync,
      flush() {},
      deleteSync() {},
      SYNC_GPU_COMMANDS_COMPLETE: 1,
      ALREADY_SIGNALED: 2,
      clientWaitSync: () => 2,
    };
    const nativeDispose = vi.fn(() => allocation.properties.dispose());
    const renderer = {
      dispose: nativeDispose,
      domElement: document.createElement("canvas"),
      shadowMap: { type: 0 },
      setClearAlpha() {},
      getContext: () => context,
    };
    const view = () => (
      <VehicleScene
        url="/exterior.glb"
        paint="#aaaaaa"
        environment="studio"
        preset="hero"
        autoRotate={false}
        lights={false}
        reducedMotion
        materialRoles={{ paint: [], headlights: [], taillights: [] }}
        cabin={
          phase === "active"
            ? {
                phase,
                request: 1,
                seat: "driver",
                resumeRotation: false,
              }
            : { phase }
        }
        cabinPreparation={{ phase: "ready", request: 1 }}
        onReady={() => {}}
        onError={() => {}}
        onProgress={() => {}}
        onManual={() => {}}
      />
    );
    const result = render(view());
    // onCreated runs only once, before either asynchronous model load resolves.
    host.onCreated!({ gl: renderer });
    host.exterior = asset();
    host.proxy = prepareVehicle(
      new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
      { paint: [], headlights: [], taillights: [] },
      [],
      true,
    );
    const proxyGeometry = (host.proxy.scene as Mesh).geometry;
    const proxyDisposed = vi.spyOn(proxyGeometry, "dispose");
    const proxyNativeDispose = nativeDispose.getMockImplementation()!;
    nativeDispose.mockImplementation(() => {
      expect(proxyDisposed).toHaveBeenCalledTimes(1);
      expect(allocation.deleted).toEqual(
        expect.arrayContaining(allocation.allocated),
      );
      expect(allocation.deleted).toHaveLength(3);
      expect(allocation.info.memory.textures).toBe(0);
      proxyNativeDispose();
    });
    host.cabin = asset();
    result.rerender(view());
    expect(host.urls.slice(-3)).toEqual([
      "/exterior.glb",
      CABIN_PROXY_URL,
      CABIN_URL,
    ]);
    const firstCabin = host.cabin;
    firstCabin.dispose();
    host.cabin = asset();
    result.rerender(view());
    expect(allocation.deleted).toHaveLength(1);
    const pending = renderer.dispose();
    expect(nativeDispose).toHaveBeenCalledTimes(1);
    expect(allocation.deleted).toEqual(
      expect.arrayContaining(allocation.allocated),
    );
    expect(allocation.deleted).toHaveLength(3);
    expect(allocation.info.memory.textures).toBe(0);
    // The source loader remains an idempotent owner even if its passive cleanup is later.
    host.exterior.dispose();
    host.cabin.dispose();
    host.proxy.dispose();
    expect(proxyDisposed).toHaveBeenCalledTimes(1);
    firstCabin.dispose();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(allocation.deleted).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("requests the full cabin from route preparation and keeps it resident independently of the selected view", () => {
  const props = {
    url: "/exterior.glb",
    paint: "#aaaaaa",
    environment: "studio" as const,
    preset: "hero",
    autoRotate: false,
    lights: false,
    reducedMotion: true,
    materialRoles: { paint: [], headlights: [], taillights: [] },
    onReady() {},
    onError() {},
    onProgress() {},
    onManual() {},
  };
  const result = render(
    <VehicleScene {...props} cabin={{ phase: "closed" }} />,
  );
  expect(host.urls.filter(Boolean)).toEqual(["/exterior.glb", CABIN_PROXY_URL]);
  host.urls = [];
  result.rerender(
    <VehicleScene
      {...props}
      cabin={{ phase: "closed" }}
      cabinPreparation={{
        phase: "loading",
        request: 1,
        progress: { phase: "downloading", loadedBytes: 0 },
      }}
    />,
  );
  expect(host.urls.filter(Boolean)).toEqual([
    "/exterior.glb",
    CABIN_PROXY_URL,
    CABIN_URL,
  ]);
  for (const phase of ["closed", "active", "closed"] as const) {
    host.urls = [];
    result.rerender(
      <VehicleScene
        {...props}
        cabin={
          phase === "active"
            ? { phase, request: 1, seat: "driver", resumeRotation: false }
            : { phase }
        }
        cabinPreparation={{ phase: "ready", request: 1 }}
      />,
    );
    expect(host.urls.filter(Boolean)).toEqual([
      "/exterior.glb",
      CABIN_PROXY_URL,
      CABIN_URL,
    ]);
  }
  host.urls = [];
  result.rerender(<VehicleScene {...props} />);
  expect(host.urls.filter(Boolean)).toEqual(["/exterior.glb"]);
});
