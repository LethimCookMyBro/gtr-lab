// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RearSignature } from "../src/components/home/RearSignature";
const runtime = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  props: {} as any,
}));
vi.mock("../src/components/home/RearVehicleScene", () => ({
  default: (props: any) => {
    runtime.props = props;
    useEffect(() => {
      runtime.mounts++;
      return () => {
        runtime.unmounts++;
      };
    }, []);
    return <canvas data-active={String(props.active)} />;
  },
}));
let intersection: IntersectionObserverCallback;
beforeEach(() => {
  runtime.mounts = runtime.unmounts = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersection = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => ({ loseContext() {} }),
  } as any);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const show = (props = {}) =>
  render(
    <MemoryRouter>
      <RearSignature {...props} />
    </MemoryRouter>,
  );
it("prepares its actual scene before intersection and keeps it alive offscreen and while hidden", async () => {
  const { container } = show();
  await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
  const canvas = container.querySelector("canvas");
  expect(runtime.mounts).toBe(1);
  act(() => runtime.props.onReady());
  for (const visible of [true, false, true]) {
    act(() =>
      intersection(
        [{ isIntersecting: visible }] as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(runtime.props.active).toBe(visible);
  }
  act(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(runtime.props.active).toBe(false);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(runtime.unmounts).toBe(0);
  expect(container.querySelector("section")?.dataset.sceneState).toBe("ready");
});
it("does not start Save-Data until opt-in and remounts failed model attempts on retry", async () => {
  const { container } = show({ saveData: true });
  expect(container.querySelector("canvas")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Load 3D view · 8.3 MB" }),
  );
  await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
  act(() => runtime.props.onError("Failed decoding"));
  expect(container.querySelector("canvas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry 3D view" }));
  await waitFor(() => expect(runtime.mounts).toBe(2));
});
it("bounds a render stall instead of allowing an endless gate", async () => {
  const { container } = show();
  await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
  vi.useFakeTimers();
  act(() => runtime.props.onLoadState({ phase: "preparing" }));
  act(() => vi.advanceTimersByTime(20001));
  expect(screen.getByRole("button", { name: "Retry 3D view" })).toBeTruthy();
  expect(
    screen.getByRole("status", { name: "R35 3D loading status" }).textContent,
  ).toMatch(/render.*too long/i);
});
