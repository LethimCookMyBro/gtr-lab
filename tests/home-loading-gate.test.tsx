// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../src/pages/HomePage";

const rear = vi.hoisted(() => ({ props: {} as any }));
const preferences = vi.hoisted(() => ({
  reducedMotion: false,
  compactHeight: false,
  saveData: false,
}));
vi.mock("../src/components/home/RearSignature", () => ({
  RearSignature: (props: any) => {
    rear.props = props;
    return <section data-testid="rear" />;
  },
}));
vi.mock("../src/components/home/useHomeMotion", () => ({
  useHomeMotion: () => {},
  useHomePreferences: () => preferences,
}));
beforeEach(() => {
  Object.assign(preferences, {
    reducedMotion: false,
    compactHeight: false,
    saveData: false,
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const show = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
function decodePoster(container: HTMLElement) {
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  let finish!: () => void;
  image.decode = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  fireEvent.load(image);
  return finish;
}
it("gates only the opening image without exposing rear model progress", () => {
  const { container } = show();
  const frame = container.querySelector(".home-film--hero iframe");
  expect(frame?.hasAttribute("inert")).toBe(true);
  const gate = screen.getByRole("dialog", { name: "Preparing GT-R LAB" });
  expect(gate.getAttribute("aria-modal")).toBe("true");
  expect(
    container.querySelector(".cinematic-home")?.hasAttribute("inert"),
  ).toBe(true);
  expect(within(gate).queryByRole("progressbar")).toBeNull();
  expect(within(gate).getByRole("status").textContent).toBe(
    "Preparing the opening image",
  );
  expect(rear.props.onLoadState).toBeUndefined();
  expect(rear.props.disabled).not.toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
});
it("releases after actual poster decode while the rear and hosted film are still pending", async () => {
  vi.useFakeTimers();
  const { container } = show();
  const frame = container.querySelector(".home-film--hero iframe");
  const finish = decodePoster(container);
  expect(screen.getByRole("dialog").getAttribute("data-state")).toBe("loading");
  await act(async () => finish());
  expect(screen.getByRole("dialog").getAttribute("data-state")).toBe(
    "resolved",
  );
  act(() => vi.advanceTimersByTime(360));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    container.querySelector(".cinematic-home")?.hasAttribute("inert"),
  ).toBe(false);
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement?.id).toBe("home-title");
  expect(container.querySelector(".home-film--hero iframe")).toBe(frame);
  expect(rear.props.disabled).not.toBe(true);
});
it("does not mistake iframe load or a failed image for a decoded opening", () => {
  const { container } = show();
  fireEvent.error(container.querySelector(".home-film-backup")!);
  fireEvent.load(container.querySelector(".home-film--hero iframe")!);
  expect(screen.getByRole("dialog").getAttribute("data-state")).toBe("loading");
});
it("Continue browsing releases focus and inertness immediately without cancelling rear work", () => {
  const { container } = show();
  const frame = container.querySelector(".home-film--hero iframe");
  fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }));
  expect(rear.props.disabled).not.toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    container.querySelector(".cinematic-home")?.hasAttribute("inert"),
  ).toBe(false);
  expect(document.activeElement?.id).toBe("home-title");
  expect(container.querySelector(".home-film--hero iframe")).toBe(frame);
});
it("keeps keyboard focus in the gate and Escape does not claim readiness", () => {
  show();
  const gate = screen.getByRole("dialog");
  const skip = screen.getByRole("button", { name: "Continue browsing" });
  expect(document.activeElement).toBe(skip);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(skip);
  fireEvent(gate, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("retains the exact 25-second image deadline and allows browsing after failure", () => {
  vi.useFakeTimers();
  show();
  act(() => vi.advanceTimersByTime(24999));
  expect(screen.getByRole("dialog").getAttribute("data-state")).toBe("loading");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("dialog").textContent).toMatch(
    /opening visual.*too long/i,
  );
  expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(rear.props.disabled).not.toBe(true);
});
it("restores preexisting scroll styles and clears its timer on route unmount", () => {
  vi.useFakeTimers();
  document.body.style.overflow = "auto";
  document.documentElement.style.overflow = "clip";
  const setTimer = vi.spyOn(window, "setTimeout");
  const clearTimer = vi.spyOn(window, "clearTimeout");
  const { unmount } = show();
  const openingTimerIndex = setTimer.mock.calls.findIndex(
    ([, delay]) => delay === 25000,
  );
  expect(openingTimerIndex).toBeGreaterThanOrEqual(0);
  const openingTimer = setTimer.mock.results[openingTimerIndex].value;
  unmount();
  expect(document.body.style.overflow).toBe("auto");
  expect(document.documentElement.style.overflow).toBe("clip");
  expect(clearTimer).toHaveBeenCalledWith(openingTimer);
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});
it("keeps actual OS motion separate from compact-height visual staging", () => {
  preferences.compactHeight = true;
  show();
  expect(rear.props.reducedMotion).toBe(true);
  expect(rear.props.audioReducedMotion).toBe(false);
});
