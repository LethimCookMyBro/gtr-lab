// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";
const setup = (route = "/configurator/premium") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AudioProvider>
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
          <Route path="/models" element={<div>Model collection</div>} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  useConfigurator.getState().reset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi
      .fn()
      .mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("configurator honest functional flow", () => {
  it("labels photograph honestly and disables materials without geometry", () => {
    setup();
    expect(screen.getByText("Photo reference · 3D asset pending")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Pearl White" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Lights" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("opens variant details and escapes without leaving the route", async () => {
    setup();
    const user = userEvent.setup();
    const details = screen.getByRole("button", { name: "Model detail" });
    await user.click(details);
    expect(screen.getByRole("dialog").textContent).toContain("565");
    expect(screen.getByRole("dialog").textContent).toContain(
      "2024 US specification",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(details);
  });
  it("switches variants without showing a renamed shared mesh", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch model" }));
    await user.click(
      screen.getByRole("button", {
        name: /GT500 Motorsport without compromise/,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "GT-R NISMO GT500" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Model detail" }));
    expect(screen.getByRole("dialog").textContent).toContain("inline-four");
    expect(screen.getByRole("dialog").textContent).toContain(
      "Rear-wheel drive",
    );
  });
  it("explains unavailable camera and detailed interior instead of teleporting into fake cabin", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Camera" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "licensed 3D asset",
    );
    expect(
      (screen.getByRole("button", { name: /Interior/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("returns to models", async () => {
    setup();
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: /Back to models/ }));
    expect(screen.getByText("Model collection")).toBeTruthy();
  });
  it("reports unknown variant", () => {
    setup("/configurator/unknown");
    expect(screen.getByText("That model isn’t in the lab.")).toBeTruthy();
  });
  it("keeps repeated panel changes exclusive", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Camera" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(screen.getByRole("button", { name: "Environment" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog").textContent).toContain("Forest road");
  });
});
