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
vi.mock("../src/components/home/RearSignature", () => ({
  RearSignature: (props: any) => {
    rear.props = props;
    return <section data-testid="rear" />;
  },
}));
vi.mock("../src/components/home/useHomeMotion", () => ({
  useHomeMotion: () => {},
  useHomePreferences: () => ({
    reducedMotion: false,
    compactHeight: false,
    saveData: false,
  }),
}));
beforeEach(() => {
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
});
const show = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
it("keeps the viewport gate closed when the film document is loaded but the model is still downloading", () => {
  const { container } = show();
  fireEvent.load(container.querySelector(".home-film--hero iframe")!);
  const gate = screen.getByRole("dialog", { name: "Preparing GT-R LAB" });
  expect(gate.getAttribute("aria-modal")).toBe("true");
  expect(
    container.querySelector(".cinematic-home")?.hasAttribute("inert"),
  ).toBe(true);
  act(() =>
    rear.props.onLoadState({
      phase: "downloading",
      loadedBytes: 1048576,
      totalBytes: 8388608,
    }),
  );
  expect(
    within(gate).getByRole("progressbar").getAttribute("aria-valuenow"),
  ).toBe("1048576");
  expect(gate.textContent).toContain("1.0 MB / 8.4 MB");
  expect(document.body.style.overflow).toBe("hidden");
});
it("requires a decoded opening image and prepared 3D render, then restores heading focus", async () => {
  const { container } = show();
  fireEvent.load(container.querySelector(".home-film--hero iframe")!);
  for (const phase of ["decoding", "preparing"]) {
    act(() => rear.props.onLoadState({ phase }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  }
  expect(
    within(screen.getByRole("dialog")).getByRole("status").textContent,
  ).toContain("Preparing the 3D render");
  act(() => rear.props.onLoadState({ phase: "ready" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  image.decode = () => Promise.resolve();
  await act(async () => fireEvent.load(image));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    container.querySelector(".cinematic-home")?.hasAttribute("inert"),
  ).toBe(false);
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement?.id).toBe("home-title");
});
it("does not release a missing opening image just because a cross-origin document loads", () => {
  const { container } = show();
  act(() => rear.props.onLoadState({ phase: "ready" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.error(container.querySelector(".home-film-backup")!);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.load(container.querySelector(".home-film--hero iframe")!);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("makes Retry a new model attempt and Continue without 3D cancels that work explicitly", () => {
  const { container } = show();
  fireEvent.load(container.querySelector(".home-film--hero iframe")!);
  act(() =>
    rear.props.onLoadState({
      phase: "error",
      message: "The model failed",
      recovery: "retry",
    }),
  );
  const firstAttempt = rear.props.attempt;
  fireEvent.click(screen.getByRole("button", { name: "Retry 3D view" }));
  expect(rear.props.attempt).toBe(firstAttempt + 1);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue without 3D" }));
  expect(rear.props.disabled).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps keyboard focus in the gate and Escape does not silently claim readiness", () => {
  show();
  const gate = screen.getByRole("dialog");
  const skip = screen.getByRole("button", { name: "Continue without 3D" });
  expect(document.activeElement).toBe(skip);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(skip);
  fireEvent(gate, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("offers a bounded recovery if both opening visual paths never become usable", () => {
  vi.useFakeTimers();
  show();
  act(() => rear.props.onLoadState({ phase: "ready" }));
  act(() => vi.advanceTimersByTime(25001));
  expect(screen.getByRole("dialog").textContent).toMatch(
    /opening visual.*too long/i,
  );
  expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
  vi.useRealTimers();
});
it("accepts a real decoded local poster without waiting for the hosted film", async () => {
  const { container } = show();
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  let decoded: () => void;
  image.decode = () =>
    new Promise<void>((resolve) => {
      decoded = resolve;
    });
  fireEvent.load(image);
  act(() => rear.props.onLoadState({ phase: "ready" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => decoded!());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-state"),
  ).toBe("loading");
});
