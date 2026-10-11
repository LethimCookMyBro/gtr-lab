import { afterEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import type { RootState } from "@react-three/fiber";
import {
  createFunctionalRenderObservation,
  registerFunctionalState,
} from "../src/components/three/functionalRenderObservation";
const host = globalThis as typeof globalThis & {
  __gtrFunctionalCaptureObserver?: (event: Record<string, unknown>) => void;
};
afterEach(() => {
  delete host.__gtrFunctionalCaptureObserver;
});
function fixture() {
  const context = {
    isContextLost: () => false,
    DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
    getParameter: vi.fn(() => null),
  };
  const canvas = {
    isConnected: true,
    width: 100,
    height: 100,
    clientWidth: 100,
    clientHeight: 100,
  };
  const renderer = {
    domElement: canvas,
    getContext: () => context,
    getPixelRatio: () => 1,
    getSize: (v: { set: (x: number, y: number) => unknown }) => v.set(100, 100),
    getRenderTarget: vi.fn(() => null),
  };
  const state = {
    gl: renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    internal: { frames: 0 },
  } as unknown as RootState;
  return { state, renderer, context, get: () => state };
}
it("does no sampling/native work without opt-in", () => {
  const f = fixture(),
    read = vi.fn();
  expect(createFunctionalRenderObservation(f.get)).toBeUndefined();
  registerFunctionalState(f.state.gl, "test", read)();
  expect(read).not.toHaveBeenCalled();
  expect(f.context.getParameter).not.toHaveBeenCalled();
});
it("observer exceptions cannot change rendering or fence ownership", () => {
  host.__gtrFunctionalCaptureObserver = () => {
    throw Error("consumer");
  };
  const f = fixture();
  expect(() => {
    const o = createFunctionalRenderObservation(f.get)!;
    const snapshot = o.begin(f.state.scene, f.state.camera);
    o.main(snapshot);
    const sync = {} as WebGLSync;
    o.fence(sync, null);
    o.wait(sync, 0x911a);
    o.retire(sync, "signaled");
    o.invalid("loss");
    o.stop();
  }).not.toThrow();
});
it("only exact root/default-target snapshots are emitted", () => {
  const events: Record<string, unknown>[] = [];
  host.__gtrFunctionalCaptureObserver = (event) => events.push(event);
  const f = fixture(),
    o = createFunctionalRenderObservation(f.get)!;
  o.main(o.begin(new Scene(), f.state.camera));
  expect(events.filter((e) => e.kind === "buffer-replaced")).toHaveLength(1);
  f.renderer.getRenderTarget.mockReturnValueOnce({} as never);
  expect(o.begin(f.state.scene, f.state.camera)).toBeUndefined();
  f.context.getParameter.mockReturnValueOnce({} as never);
  expect(o.begin(f.state.scene, f.state.camera)).toBeUndefined();
  o.main(o.begin(f.state.scene, f.state.camera));
  expect(events.filter((e) => e.kind === "main")).toHaveLength(1);
});
it("draw snapshot is immutable and pre/post render drift is explicit", () => {
  const events: Record<string, unknown>[] = [];
  host.__gtrFunctionalCaptureObserver = (event) => events.push(event);
  const f = fixture();
  let value = 1;
  const cleanup = registerFunctionalState(f.state.gl, "requested", () => ({
    value,
  }));
  const o = createFunctionalRenderObservation(f.get)!;
  const snapshot = o.begin(f.state.scene, f.state.camera);
  value = 2;
  o.main(snapshot);
  const main = events.find((e) => e.kind === "main")!;
  expect(main.stable).toBe(false);
  expect(main.snapshot).toMatchObject({ requested: { value: 1 } });
  cleanup();
  o.stop();
});
it("replaced fences inherit only the actual pending prefix draw lineage", () => {
  const events: Record<string, unknown>[] = [];
  host.__gtrFunctionalCaptureObserver = (event) => events.push(event);
  const f = fixture(),
    o = createFunctionalRenderObservation(f.get)!;
  const a = {} as WebGLSync,
    b = {} as WebGLSync;
  o.main(o.begin(f.state.scene, f.state.camera));
  o.fence(a, null);
  o.fence(b, a);
  expect(events.filter((e) => e.kind === "fence")).toMatchObject([
    { id: 1, draws: [1] },
    { id: 2, draws: [1], previous: 1 },
  ]);
  o.wait(b, 0x911c);
  o.retire(b, "signaled");
  o.stop();
});
