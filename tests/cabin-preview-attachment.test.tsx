// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Group, PerspectiveCamera, Scene } from "three";
import { CabinAttachment } from "../src/components/three/CabinAttachment";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";
const host = vi.hoisted(() => ({
  state: null as unknown as {
    gl: {
      compile: ReturnType<typeof vi.fn>;
      getContext: ReturnType<typeof vi.fn>;
      info: { programs: { program: object }[] };
    };
    camera: PerspectiveCamera;
    scene: Scene;
    invalidate: ReturnType<typeof vi.fn>;
  },
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: typeof host.state) => unknown) =>
    selector(host.state),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const prepared = (): PreparedVehicle => ({
  scene: new Group(),
  bindings: [],
  scale: 1,
  position: [0, 0, 0],
  dispose() {},
});
it("does not enter until its real renderer compile resolves, and ignores a cancelled completion", async () => {
  let finished = false;
  const parameter = vi.fn(() => finished);
  host.state = {
    gl: {
      compile: vi.fn(),
      getContext: vi.fn(() => ({
        getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }),
        isContextLost: () => false,
        getProgramParameter: parameter,
      })),
      info: { programs: [{ program: {} }] },
    },
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    invalidate: vi.fn(),
  };
  const cabin = prepared(),
    exterior = prepared();
  const ready = vi.fn(),
    failed = vi.fn();
  const result = render(
    <CabinAttachment
      asset={cabin}
      exterior={exterior}
      active={false}
      request={3}
      onReady={ready}
      onError={failed}
    />,
  );
  expect(ready).not.toHaveBeenCalled();
  expect(host.state.gl.compile).toHaveBeenCalledWith(
    cabin.scene,
    host.state.camera,
    host.state.scene,
  );
  result.unmount();
  const calls = parameter.mock.calls.length;
  finished = true;
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  expect(parameter).toHaveBeenCalledTimes(calls);
  expect(ready).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});
it("reports a compilation failure only to the optional preview", async () => {
  host.state = {
    gl: {
      compile: vi.fn(() => {
        throw new Error("GPU compile rejected");
      }),
      getContext: vi.fn(),
      info: { programs: [] },
    },
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    invalidate: vi.fn(),
  };
  const ready = vi.fn(),
    failed = vi.fn();
  render(
    <CabinAttachment
      asset={prepared()}
      exterior={prepared()}
      active={false}
      request={7}
      onReady={ready}
      onError={failed}
    />,
  );
  await waitFor(() =>
    expect(failed).toHaveBeenCalledWith(
      7,
      expect.stringMatching(/GPU compile rejected/),
    ),
  );
  expect(ready).not.toHaveBeenCalled();
});
it("preserves the reviewed native cabin shadow policy instead of adding exterior shadow passes", async () => {
  const { Mesh, BoxGeometry, MeshStandardMaterial } = await import("three");
  const cabin = prepared();
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cabin.scene.add(mesh);
  host.state = {
    gl: {
      compile: vi.fn(),
      getContext: vi.fn(() => ({
        getExtension: () => null,
        isContextLost: () => false,
      })),
      info: { programs: [] },
    },
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    invalidate: vi.fn(),
  };
  const ready = vi.fn();
  render(
    <CabinAttachment
      asset={cabin}
      exterior={prepared()}
      active={false}
      request={1}
      onReady={ready}
      onError={() => {}}
    />,
  );
  await waitFor(() => expect(ready).toHaveBeenCalled());
  expect(mesh.castShadow).toBe(false);
  expect(mesh.receiveShadow).toBe(false);
});
