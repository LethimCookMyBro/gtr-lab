// @vitest-environment jsdom
import { StrictMode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OpeningMark } from "../src/components/home/OpeningMark";
import { HeroFilm } from "../src/components/home/HeroFilm";
import { ModelInvitations } from "../src/components/home/ModelInvitations";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const props = {
  scene: { phase: "ready" as const },
  heroReady: true,
  reducedMotion: false,
  onContinue: vi.fn(),
  onRetry: vi.fn(),
};
const opening = (pending: boolean, reducedMotion = false) => (
  <StrictMode>
    <h1 id="home-title" tabIndex={-1}>
      Home
    </h1>
    <OpeningMark {...props} pending={pending} reducedMotion={reducedMotion} />
  </StrictMode>
);
it("fades the real modal after readiness, then releases scroll and focus within a bounded time", () => {
  vi.useFakeTimers();
  const { rerender } = render(opening(true));
  rerender(opening(false));
  expect(screen.getByRole("dialog").getAttribute("data-state")).toBe(
    "resolved",
  );
  expect(document.body.style.overflow).toBe("hidden");
  act(() => vi.advanceTimersByTime(400));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement?.id).toBe("home-title");
});
it("completes only the real dialog opacity transition, without waiting for its safety deadline", () => {
  vi.useFakeTimers();
  const { rerender } = render(opening(true));
  rerender(opening(false));
  const gate = screen.getByRole("dialog");
  const transition = (target: Element, propertyName: string) => {
    const event = new Event("transitionend", { bubbles: true });
    Object.defineProperty(event, "propertyName", { value: propertyName });
    fireEvent(target, event);
  };
  transition(gate.firstElementChild!, "opacity");
  transition(gate, "transform");
  expect(screen.getByRole("dialog")).toBeTruthy();
  transition(gate, "opacity");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement?.id).toBe("home-title");
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("cancels a stale close when preparation reenters during completion", () => {
  vi.useFakeTimers();
  const { rerender } = render(opening(true));
  rerender(opening(false));
  act(() => vi.advanceTimersByTime(100));
  rerender(opening(true));
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
  rerender(opening(false));
  act(() => vi.advanceTimersByTime(400));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("skips immediately even during pending work and respects reduced motion", () => {
  vi.useFakeTimers();
  const { rerender } = render(opening(true));
  fireEvent.click(screen.getByRole("button", { name: "Continue without 3D" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(opening(false));
  rerender(opening(true, true));
  rerender(opening(false, true));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("animates chrome for the actual pending lifetime without recoloring the emblem each loop", () => {
  const css = readFileSync("src/styles/home-opening-cards.css", "utf8");
  expect(css).toMatch(/gtr-chrome-light-pass[^;]+infinite/);
  expect(css).not.toContain("gtr-red-reveal");
  expect(css).not.toContain(".home-hero-sticky > .home-opening");
});
it("keeps hero recovery in a native keyboard disclosure and leaves actual errors explicit", () => {
  const { container } = render(
    <MemoryRouter>
      <HeroFilm reducedMotion={false} saveData={false} />
    </MemoryRouter>,
  );
  const disclosure = container.querySelector("details.home-film-tools")!;
  expect(disclosure).not.toBeNull();
  expect(disclosure.querySelector("summary")?.textContent).toBe(
    "Film controls",
  );
  expect(disclosure.hasAttribute("open")).toBe(false);
  expect(disclosure.querySelector(".home-film-retry")).toBeTruthy();
  fireEvent.load(container.querySelector("iframe")!);
  expect(container.querySelector(".home-film-error")).toBeNull();
  expect(container.querySelector(".home-film-status")).toBeNull();
});
it("uses the full-width intact film and removes only the lineup asset-note strip", () => {
  const css = readFileSync("src/styles/home-opening-cards.css", "utf8");
  expect(css).not.toContain("100svh - 176px");
  expect(css).toContain("--hero-panel-height");
  const { container } = render(
    <MemoryRouter>
      <ModelInvitations />
    </MemoryRouter>,
  );
  expect(container.querySelector(".home-model-asset-note")).toBeNull();
  expect(
    container.querySelector('[aria-describedby="home-model-asset-note"]'),
  ).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(6);
  expect(screen.getAllByText("View photos")).toHaveLength(5);
});
