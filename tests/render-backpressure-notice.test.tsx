// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";
import type { VehicleSceneProps } from "../src/components/three/types";
const scene = vi.hoisted(() => ({
  props: [] as VehicleSceneProps[],
  mounts: 0,
  unmounts: 0,
}));
vi.mock("../src/components/three/VehicleScene", () => ({
  default: (props: VehicleSceneProps) => {
    scene.props.push(props);
    useEffect(() => {
      scene.mounts++;
      return () => {
        scene.unmounts++;
      };
    }, []);
    return <div data-testid="viewer">Mounted viewer</div>;
  },
}));
beforeEach(() => {
  useConfigurator.getState().reset();
  scene.props = [];
  scene.mounts = 0;
  scene.unmounts = 0;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/configurator/gt3")}>
        Show reference
      </button>
      <button onClick={() => navigate("/configurator/premium")}>
        Show premium
      </button>
    </>
  );
}
async function setup() {
  render(
    <MemoryRouter initialEntries={["/configurator/premium"]}>
      <AudioProvider>
        <Navigation />
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
  await screen.findByTestId("viewer");
}
it("shows a nonfatal waiting notice above the loading scene, clears on completion, and keeps rendering mounted", async () => {
  await setup();
  const mounts = scene.mounts,
    unmounts = scene.unmounts;
  act(() => scene.props.at(-1)!.onRenderPending?.(true));
  expect(screen.getByText(/Rendering is taking longer/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry viewer" })).toBeTruthy();
  expect(useConfigurator.getState().error).toBeNull();
  expect(useConfigurator.getState().ready).toBe(false);
  expect(scene.mounts).toBe(mounts);
  expect(scene.unmounts).toBe(unmounts);
  act(() => scene.props.at(-1)!.onRenderPending?.(false));
  expect(screen.queryByRole("button", { name: "Retry viewer" })).toBeNull();
  expect(scene.unmounts).toBe(unmounts);
});
it("retries a pending-but-not-error viewer through a real remount and rejects retired-owner status", async () => {
  await setup();
  const mounts = scene.mounts,
    unmounts = scene.unmounts;
  const generation = useConfigurator.getState().sceneRequest;
  const old = scene.props.at(-1)!.onRenderPending;
  act(() => old?.(true));
  fireEvent.click(screen.getByRole("button", { name: "Retry viewer" }));
  await waitFor(() => expect(scene.mounts).toBe(mounts + 1));
  expect(scene.unmounts).toBe(unmounts + 1);
  expect(useConfigurator.getState().sceneRequest).toBe(generation + 1);
  expect(useConfigurator.getState().error).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry viewer" })).toBeNull();
  act(() => old?.(true));
  expect(screen.queryByRole("button", { name: "Retry viewer" })).toBeNull();
  const current = scene.props.at(-1)!.onRenderPending;
  act(() => current?.(true));
  act(() => old?.(false));
  expect(screen.getByRole("button", { name: "Retry viewer" })).toBeTruthy();
  act(() => current?.(false));
  expect(screen.queryByRole("button", { name: "Retry viewer" })).toBeNull();
});

it("never reuses a retired status generation after reset and same-model selection", async () => {
  await setup();
  const retired = scene.props.at(-1)!.onRenderPending;
  const before = useConfigurator.getState().sceneRequest;
  act(() => useConfigurator.getState().reset());
  expect(useConfigurator.getState().sceneRequest).toBeGreaterThan(before);
  const resetGeneration = useConfigurator.getState().sceneRequest;
  act(() => useConfigurator.getState().selectVariant("premium"));
  expect(useConfigurator.getState().sceneRequest).toBeGreaterThan(
    resetGeneration,
  );
  act(() => retired?.(true));
  expect(screen.queryByRole("button", { name: "Retry viewer" })).toBeNull();
  act(() => scene.props.at(-1)!.onRenderPending?.(true));
  expect(screen.getByRole("button", { name: "Retry viewer" })).toBeTruthy();
});

it("keeps environment feedback available after the temporary pending notice clears", async () => {
  await setup();
  act(() =>
    useConfigurator.setState({ notice: "Lighting fallback remains available" }),
  );
  act(() => scene.props.at(-1)!.onRenderPending?.(true));
  expect(screen.queryByText("Lighting fallback remains available")).toBeNull();
  act(() => scene.props.at(-1)!.onRenderPending?.(false));
  expect(screen.getByText("Lighting fallback remains available")).toBeTruthy();
});

it("preserves the existing error Retry path while giving the replacement a fresh generation", async () => {
  await setup();
  const mounts = scene.mounts,
    unmounts = scene.unmounts;
  const generation = useConfigurator.getState().sceneRequest;
  act(() => scene.props.at(-1)!.onError("Graphics connection was lost"));
  expect(screen.queryByTestId("viewer")).toBeNull();
  expect(scene.unmounts).toBe(unmounts + 1);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByTestId("viewer");
  expect(scene.mounts).toBe(mounts + 1);
  expect(useConfigurator.getState().sceneRequest).toBe(generation + 1);
});

it("mounts a warm viewer only once per route entry rather than before and after model initialization", async () => {
  await setup();
  cleanup(); // Resolve React.lazy once, then exercise a warm route mount.
  const warmBefore = scene.mounts;
  await setup();
  expect(scene.mounts - warmBefore).toBe(1);
  const navigationBefore = scene.mounts;
  fireEvent.click(screen.getByRole("button", { name: "Show reference" }));
  await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Show premium" }));
  await screen.findByTestId("viewer");
  expect(scene.mounts - navigationBefore).toBe(1);
});
