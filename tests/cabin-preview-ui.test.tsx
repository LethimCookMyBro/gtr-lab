// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";
vi.mock("../src/components/three/VehicleScene", () => ({
  default: () => <div>WebGL verified separately</div>,
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
it("opts in from the camera drawer, shows real bytes and offers cancel and retry", async () => {
  setup();
  act(() => useConfigurator.setState({ ready: true }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Camera" }));
  await user.click(
    screen.getByRole("button", { name: /Cabin preview · work in progress/ }),
  );
  expect(state().cabin.phase).toBe("loading");
  const request = state().cabinRequest;
  act(() =>
    state().cabinProgress(request, {
      phase: "downloading",
      loadedBytes: 4000000,
      totalBytes: 14599520,
    }),
  );
  expect(screen.getByText("4.0 MB / 14.6 MB")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Cancel cabin loading" }),
  );
  expect(state().cabin.phase).toBe("closed");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Camera" }),
  );
  act(() => state().beginCabin());
  act(() => state().cabinFailed(state().cabinRequest, "HTTP 404"));
  expect(screen.getByRole("alert").textContent).toContain("HTTP 404");
  await user.click(screen.getByRole("button", { name: "Retry cabin preview" }));
  expect(state().cabin.phase).toBe("loading");
});
it("offers three fixed seats and Escape restores exterior focus without affecting a foreground drawer", async () => {
  setup();
  act(() => useConfigurator.setState({ ready: true }));
  act(() => state().beginCabin());
  act(() => state().cabinReady(state().cabinRequest));
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
it.each(["nismo", "tspec", "gtr50", "gt3", "gt500"])(
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
  act(() => state().beginCabin());
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
    act(() => state().beginCabin());
    const request = state().cabinRequest;
    if (phase === "active") act(() => state().cabinReady(request));
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
