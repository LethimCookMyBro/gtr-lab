// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useRearRenderPreparation } from "../src/components/home/useRearRenderPreparation";
import { PerspectiveCamera, Scene } from "three";
const runtime = vi.hoisted(() => ({ state: {} as any, frame: () => {} }));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: any) => select(runtime.state),
  useFrame: (cb: () => void) => {
    runtime.frame = cb;
  },
}));
let compiled: () => void;
beforeEach(() => {
  runtime.state = {
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    invalidate: vi.fn(),
    gl: {
      compileAsync: () =>
        new Promise<void>((resolve) => {
          compiled = resolve;
        }),
      info: { render: { frame: 0 } },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("waits for shader compilation and an actual completed render instead of counting React frames", async () => {
  let ready = 0;
  renderHook(() =>
    useRearRenderPreparation(
      () => ready++,
      () => {},
    ),
  );
  act(() => {
    for (let i = 0; i < 10; i++) runtime.frame();
  });
  expect(ready).toBe(0);
  await act(async () => {
    await Promise.resolve();
    compiled();
  });
  act(() => {
    for (let i = 0; i < 10; i++) runtime.frame();
  });
  expect(ready).toBe(0);
  act(() => {
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(1);
  act(() => {
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(1);
});
it("does not complete a disposed attempt when compilation finishes late", async () => {
  let ready = 0;
  const { unmount } = renderHook(() =>
    useRearRenderPreparation(
      () => ready++,
      () => {},
    ),
  );
  unmount();
  await act(async () => {
    await Promise.resolve();
    compiled();
  });
  act(() => {
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(0);
});
it("reports compilation failure without a false ready event", async () => {
  runtime.state.gl.compileAsync = () =>
    Promise.reject(new Error("GPU compile failed"));
  const errors: string[] = [];
  let ready = 0;
  await act(async () => {
    renderHook(() =>
      useRearRenderPreparation(
        () => ready++,
        (message) => errors.push(message),
      ),
    );
  });
  expect(ready).toBe(0);
  expect(errors[0]).toContain("GPU compile failed");
});
it("rejects shader link failures even when compileAsync resolves successfully", async () => {
  runtime.state.gl.debug = { onShaderError: null };
  const errors: string[] = [];
  let ready = 0;
  runtime.state.gl.compileAsync = async () => {
    runtime.state.gl.debug.onShaderError?.({}, {}, {}, {});
  };
  await act(async () => {
    renderHook(() =>
      useRearRenderPreparation(
        () => ready++,
        (message) => errors.push(message),
      ),
    );
  });
  act(() => {
    runtime.frame();
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(0);
  expect(errors[0]).toMatch(/shader/i);
});

it("captures first-use environment shader failure during the studio layout effect", async () => {
  runtime.state.gl.debug = { onShaderError: null };
  runtime.state.gl.compileAsync = async () => {};
  const errors: string[] = [];
  let ready = 0;
  function Preparation() {
    useRearRenderPreparation(
      () => ready++,
      (message) => errors.push(message),
    );
    return null;
  }
  function Studio() {
    useLayoutEffect(() => {
      runtime.state.gl.debug.onShaderError?.({}, {}, {}, {});
    }, []);
    return null;
  }
  await act(async () => {
    render(
      <>
        <Preparation />
        <Studio />
      </>,
    );
  });
  act(() => {
    runtime.frame();
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(0);
  expect(errors[0]).toMatch(/shader/i);
});
