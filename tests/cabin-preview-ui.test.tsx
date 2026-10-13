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
it("offers three fixed seats and Escape restores exterior focus without affecting a foreground drawer", async () => {
  setup();
  act(() => useConfigurator.setState({ ready: true }));
  act(() => state().prepareCabin());
  act(() => state().cabinReady(state().cabinRequest));
  act(() => state().beginCabin());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Passenger" }));
  expect(state().cabin).toMatchObject({ seat: "passenger" });
  await user.click(screen.getByRole("button", { name: "Rear seat" }));
  expect(state().cabin).toMatchObject({ seat: "rear" });
  await user.click(screen.getByRole("button", { name: "Model detail" }));
  await user.keyboard("{Escape}");
  expect(state().cabin.phase).toBe("active");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.keyboard("{Escape}");
  expect(state().cabin.phase).toBe("closed");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Camera" }),
  );
});
it.each(["nismo", "tspec", "gtr50", "gt3", "formula-e"])(
  "keeps %s unavailable with no preview entry",
  async (id) => {
    setup(id);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Camera" }));
    expect(screen.queryByRole("button", { name: /Cabin preview/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Interior/ }).hasAttribute("disabled"),
    ).toBe(true);
  },
);

it("does not move focus out of a foreground drawer when optional loading resolves", async () => {
  setup();
  act(() => useConfigurator.setState({ ready: true }));
  act(() => state().prepareCabin());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Model detail" }));
  const dialog = screen.getByRole("dialog");
  expect(document.activeElement).toBe(dialog);
  act(() => state().cabinReady(state().cabinRequest));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(document.activeElement).toBe(dialog);
});
it.each(["loading", "active"] as const)(
  "leaves no preview controls after %s preview switches to NISMO",
  async (phase) => {
    setup();
    act(() => useConfigurator.setState({ ready: true }));
    act(() => state().prepareCabin());
    const request = state().cabinRequest;
    if (phase === "active") {
      act(() => state().cabinReady(request));
      act(() => state().beginCabin());
    }
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch model" }));
    await user.click(
      screen.getByRole("button", { name: /NISMO Precision under pressure/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "GT-R NISMO" }),
    ).toBeTruthy();
    act(() => state().cabinReady(request));
    expect(screen.queryByLabelText("Cabin preview controls")).toBeNull();
    expect(screen.getByText("Photo reference · 3D asset pending")).toBeTruthy();
  },
);

it("announces window readiness without gating exterior controls or changing cabin state", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  act(() =>
    useConfigurator.setState({
      ready: true,
      paintAvailable: true,
      lightsAvailable: true,
    }),
  );
  act(() => state().cabinReady(state().cabinRequest));
  expect(screen.getByText("Loading window view…")).toBeTruthy();
  const lights = screen.getByRole("button", { name: "Lights" });
  expect(lights.hasAttribute("disabled")).toBe(false);
  const provenance = screen.getByRole("button", { name: /Model provenance/ });
  expect(
    provenance.parentElement
      ?.querySelector(".cabin-window-status")
      ?.getAttribute("role"),
  ).toBe("status");
  expect(
    provenance.contains(document.querySelector(".cabin-window-status")),
  ).toBe(false);
  expect(
    screen.getByRole("button", {
      name: "Model provenance & limitations",
    }),
  ).toBe(provenance);
  act(() => viewer.props!.onWindowStatus!("unavailable"));
  expect(screen.getByText("Window view unavailable")).toBeTruthy();
  expect(lights.hasAttribute("disabled")).toBe(false);
  expect(state().ready).toBe(true);
  expect(state().error).toBeNull();
  expect(state().cabin.phase).toBe("closed");
  act(() => viewer.props!.onWindowStatus!("ready"));
  expect(screen.getByText("Window view ready · Simplified cabin")).toBeTruthy();
});

it("hides optional window status on a model switch and ignores the old model callback", async () => {
  setup();
  await waitFor(() => expect(viewer.props).not.toBeNull());
  const oldStatus = viewer.props!.onWindowStatus!;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Switch model" }));
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: /NISMO Precision under pressure/ }),
    );
  act(() => oldStatus("ready"));
  expect(document.querySelector(".cabin-window-status")).toBeNull();
  expect(state().selectedVariant).toBe("nismo");
});

it.each(["loading", "ready", "unavailable"] as const)(
  "hides irrelevant exterior-window announcements inside the full cabin and restores latest %s status on exit",
  async (status) => {
    setup();
    await waitFor(() => expect(viewer.props).not.toBeNull());
    act(() => useConfigurator.setState({ ready: true }));
    act(() => state().prepareCabin());
    const label = document.querySelector<HTMLElement>(".cabin-window-status")!;
    expect(label.hidden).toBe(false);
    act(() => state().cabinReady(state().cabinRequest));
    act(() => state().beginCabin());
    expect(label.hidden).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => viewer.props!.onWindowStatus!(status));
    expect(label.hidden).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(state().cabin.phase).toBe("active");
    act(() => state().exitCabin(false));
    expect(label.hidden).toBe(false);
    expect(screen.getByRole("status")).toBe(label);
    expect(label.textContent).toBe(
      status === "loading"
        ? "Loading window view…"
        : status === "ready"
          ? "Window view ready · Simplified cabin"
          : "Window view unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Model provenance & limitations" }),
    ).toBeTruthy();
  },
);
