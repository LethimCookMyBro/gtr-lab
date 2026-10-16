// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";
const viewer = vi.hoisted(() => ({
  props: null as
    import("../src/components/three/types").VehicleSceneProps | null,
}));
vi.mock("../src/components/three/VehicleScene", () => ({
  default: (
    props: import("../src/components/three/types").VehicleSceneProps,
  ) => {
    viewer.props = props;
    return <div>WebGL verified separately</div>;
  },
}));
const state = () => useConfigurator.getState();
const setup = (id = "premium") =>
  render(
    <MemoryRouter initialEntries={["/configurator/" + id]}>
      <AudioProvider>
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  state().reset();
  viewer.props = null;
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("automatically prepares once while navigation and content remain available", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  expect(state().cabinPreparation.phase).toBe("idle");
  expect(screen.getByRole("link", { name: "Back to models" })).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Model detail" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  act(() => viewer.props!.onReady());
  await waitFor(() => expect(state().cabinPreparation.phase).toBe("loading"));
  expect(state().cabin.phase).toBe("closed");
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
  act(() =>
    state().cabinProgress(state().cabinRequest, {
      phase: "downloading",
      loadedBytes: 6600000,
      totalBytes: 19170816,
    }),
  );
  expect(screen.getByText("6.6 MB / 19.2 MB")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Cancel cabin loading" }),
  ).toBeNull();
});
it("enables a direct Interior view only after complete preparation, then retains readiness on exit", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  act(() => viewer.props!.onReady());
  await waitFor(() => expect(state().cabinPreparation.phase).toBe("loading"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Camera" }));
  const entry = screen.getByRole("button", { name: "Interior" });
  expect(entry.hasAttribute("disabled")).toBe(true);
  act(() => state().cabinReady(state().cabinRequest));
  expect(entry.hasAttribute("disabled")).toBe(false);
  await user.click(entry);
  expect(state().cabin.phase).toBe("active");
  expect(screen.getByRole("button", { name: "Driver" })).toBeTruthy();
  const request = state().cabinRequest;
  await user.click(screen.getByRole("button", { name: "Back to exterior" }));
  expect(state().cabinPreparation).toEqual({ phase: "ready", request });
  await user.click(screen.getByRole("button", { name: "Camera" }));
  await user.click(screen.getByRole("button", { name: "Interior" }));
  expect(state().cabinRequest).toBe(request);
  expect(state().cabin.phase).toBe("active");
});
it("releases usable exterior controls after a cabin failure and provides scoped retry", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  act(() => {
    viewer.props!.onReady();
    useConfigurator.setState({ lightsAvailable: true });
  });
  await waitFor(() => expect(state().cabinPreparation.phase).toBe("loading"));
  const request = state().cabinRequest;
  act(() => state().cabinFailed(request, "Textures could not be decoded."));
  expect(screen.getByRole("alert").textContent).toContain(
    "Textures could not be decoded.",
  );
  expect(
    screen.getByRole("button", { name: "Lights" }).hasAttribute("disabled"),
  ).toBe(false);
  expect(document.querySelector(".scene-loading")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry interior preparation" }));
  expect(state().cabinRequest).toBeGreaterThan(request);
  expect(state().cabinPreparation.phase).toBe("loading");
});

it("keeps a genuine whole-viewer retry available while native completion and the preparation mask remain pending", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  act(() => viewer.props!.onReady());
  await waitFor(() => expect(state().cabinPreparation.phase).toBe("loading"));
  const previous = state().sceneRequest,
    request = state().cabinRequest;
  const oldReady = viewer.props!.onCabinReady!;
  act(() => viewer.props!.onRenderPending!(true));
  expect(document.querySelector(".scene-loading")).not.toBeNull();
  const retry = screen.getByRole("button", { name: "Retry viewer" });
  expect(retry.hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("link", { name: "Back to models" })).toBeTruthy();
  await userEvent.setup().click(retry);
  expect(state().sceneRequest).toBeGreaterThan(previous);
  expect(state().cabinPreparation.phase).toBe("idle");
  act(() => oldReady(request));
  expect(state().cabinPreparation.phase).toBe("idle");
  expect(state().ready).toBe(false);
});
it("does not start preparation on a photo page after cancelling the active model", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  act(() => viewer.props!.onReady());
  await waitFor(() => expect(state().cabinPreparation.phase).toBe("loading"));
  const request = state().cabinRequest,
    oldReady = viewer.props!.onCabinReady!;
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Switch model" }));
  await user.click(
    screen.getByRole("button", { name: /NISMO Precision under pressure/ }),
  );
  expect(
    await screen.findByText("Photo reference · 3D asset pending"),
  ).toBeTruthy();
  act(() => oldReady(request));
  expect(state().cabinPreparation.phase).toBe("idle");
  expect(state().cabinRequest).toBe(request);
  expect(state().cabin.phase).toBe("closed");
});

it("offers the optional 2008 study and keeps its details separate from later Premium specifications", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  expect(viewer.props!.url).toBe("/models/ciasny-r35.glb");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Switch model" }));
  await user.click(screen.getByRole("button", { name: "2008 R35 study" }));
  await waitFor(() => expect(viewer.props!.url).toContain("polytigr-r35-2008"));
  expect(viewer.props!.cabinLayout?.kind).toBe("integrated");
  expect(
    screen.getByRole("heading", { name: "2008 GT-R R35 · Study" }),
  ).toBeTruthy();
  expect(screen.queryByText(/Loading window view/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Model detail" }));
  expect(screen.queryByText("2024 US specification")).toBeNull();
  expect(screen.queryByText("Published power")).toBeNull();
  expect(
    screen.getByText("2008 artist model · factory specifications unverified"),
  ).toBeTruthy();
});
