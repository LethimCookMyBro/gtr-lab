// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from "react";
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
  vi.useFakeTimers();
  let complete = false;
  compiled = () => {
    complete = true;
  };
  runtime.state = {
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    invalidate: vi.fn(),
    gl: {
      compile: () => new Set(),
      getContext: () => ({
        isContextLost: () => false,
        getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
        getProgramParameter: () => complete,
      }),
      info: { render: { frame: 0 }, programs: [{ program: {} }] },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    vi.advanceTimersByTime(10);
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
  await act(async () => {
    await Promise.resolve();
  });
  unmount();
  await act(async () => {
    await Promise.resolve();
    compiled();
    vi.advanceTimersByTime(10);
  });
  act(() => {
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(0);
});
it("reports compilation failure without a false ready event", async () => {
  runtime.state.gl.compile = () => {
    throw new Error("GPU compile failed");
  };
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
it("rejects shader link failures even when shader completion is reported", async () => {
  runtime.state.gl.debug = { onShaderError: null };
  const errors: string[] = [];
  let ready = 0;
  runtime.state.gl.compile = () => {
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
  expect(vi.getTimerCount()).toBe(0);
});

it("captures first-use environment shader failure during the studio layout effect", async () => {
  runtime.state.gl.debug = { onShaderError: null };
  runtime.state.gl.compile = () => {};
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

it("stops its pending compilation poll before unmount disposes renderer programs", async () => {
  vi.useFakeTimers();
  let disposed = false;
  let polls = 0;
  const program = { program: {} };
  runtime.state.gl.info.programs = [program];
  runtime.state.gl.compile = () => new Set();
  runtime.state.gl.getContext = () => ({
    isContextLost: () => false,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter: () => {
      polls++;
      if (disposed)
        throw new Error("Compiling resources were already disposed");
      return false;
    },
  });
  // Three r180's compileAsync closure polls again without a cancellation API.
  runtime.state.gl.compileAsync = () =>
    new Promise<void>(() => {
      const check = () => {
        runtime.state.gl.getContext().getProgramParameter();
        setTimeout(check, 10);
      };
      check();
    });
  const { unmount } = renderHook(() =>
    useRearRenderPreparation(
      () => {},
      () => {},
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(polls).toBeGreaterThan(0);
  unmount();
  disposed = true;
  runtime.state.gl.info.programs = [];
  expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("cancels StrictMode's abandoned preparation and starts only the surviving lifetime", async () => {
  let ready = 0;
  const errors: string[] = [];
  const { unmount } = renderHook(
    () =>
      useRearRenderPreparation(
        () => ready++,
        (message) => errors.push(message),
      ),
    { wrapper: StrictMode },
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => {
    compiled();
    vi.advanceTimersByTime(10);
  });
  act(() => {
    runtime.frame();
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(ready).toBe(1);
  expect(errors).toEqual([]);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores the cancelled attempt and prepares a fresh retry", async () => {
  let oldReady = 0;
  let newReady = 0;
  const errors: string[] = [];
  const first = renderHook(() =>
    useRearRenderPreparation(
      () => oldReady++,
      (message) => errors.push(message),
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
  first.unmount();
  renderHook(() =>
    useRearRenderPreparation(
      () => newReady++,
      (message) => errors.push(message),
    ),
  );
  await act(async () => {
    await Promise.resolve();
    compiled();
    vi.advanceTimersByTime(10);
  });
  act(() => {
    runtime.frame();
    runtime.state.gl.info.render.frame++;
    runtime.frame();
  });
  expect(oldReady).toBe(0);
  expect(newReady).toBe(1);
  expect(errors).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
