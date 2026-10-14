// @vitest-environment jsdom
import { StrictMode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Film } from "../src/components/home/Film";
import { homeFilms } from "../src/data/films";
let observe: IntersectionObserverCallback;
let prepare: IntersectionObserverCallback;
beforeEach(() => {
  prepare = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        if (options?.rootMargin) prepare = callback;
        else observe = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const scene = (
  reducedMotion = false,
  saveData = false,
  kind: "hero" | "detail" = "hero",
) => (
  <MemoryRouter>
    <StrictMode>
      <Film kind={kind} reducedMotion={reducedMotion} saveData={saveData} />
    </StrictMode>
  </MemoryRouter>
);
const visible = (value: boolean) =>
  act(() =>
    observe(
      [{ isIntersecting: value } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
const tabVisible = (value: boolean) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: value ? "visible" : "hidden",
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
};
it("uses the exact intact publisher iframe and exposes source credits", () => {
  const { container } = render(scene());
  const frame = container.querySelector("iframe")!;
  expect(frame.src).toBe(homeFilms.hero.embed);
  expect(frame.getAttribute("allow")).toBe("autoplay; fullscreen");
  expect(container.querySelector("video")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: /Watch original opening/ })
      .getAttribute("href"),
  ).toBe(homeFilms.hero.page);
  fireEvent.load(frame);
  expect(container.firstElementChild?.getAttribute("data-film-state")).toBe(
    "embedded",
  );
});
it("leaves detail media unloaded until that section becomes visible", () => {
  const { container } = render(scene(false, false, "detail"));
  expect(container.querySelector("iframe")).toBeNull();
  visible(true);
  expect(container.querySelector("iframe")?.src).toBe(homeFilms.detail.embed);
});
it.each([
  [true, false],
  [false, true],
  [true, true],
])(
  "requires explicit play under reduced/data-saving policy %s/%s",
  (reduced, save) => {
    const { container } = render(scene(reduced, save));
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
    expect(container.querySelector("iframe")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
    expect(container.querySelector("iframe")).toBeNull();
  },
);
it("unloads offscreen and never restarts a user-stopped film", () => {
  const { container } = render(scene());
  visible(false);
  expect(container.querySelector("iframe")).toBeNull();
  visible(true);
  expect(container.querySelector("iframe")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
  visible(false);
  visible(true);
  expect(container.querySelector("iframe")).toBeNull();
});
it("unloads a hidden tab and honors a stop after returning", () => {
  const { container } = render(scene());
  tabVisible(false);
  expect(container.querySelector("iframe")).toBeNull();
  tabVisible(true);
  expect(container.querySelector("iframe")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
  tabVisible(false);
  tabVisible(true);
  expect(container.querySelector("iframe")).toBeNull();
});
it("does not mount a film in an initially hidden tab", () => {
  tabVisible(false);
  const { container } = render(scene());
  expect(container.querySelector("iframe")).toBeNull();
});
it("stops an explicit play when the visitor switches to reduced motion", () => {
  const { container, rerender } = render(scene());
  fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
  fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
  rerender(scene(true, false));
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
  expect(container.querySelector("iframe")).not.toBeNull();
});
it("does not let a detached iframe's late load reactivate a stopped film", () => {
  const { container } = render(scene());
  const old = container.querySelector("iframe")!;
  fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
  fireEvent.load(old);
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.firstElementChild?.getAttribute("data-film-state")).toBe(
    "stopped",
  );
  fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
  expect(container.firstElementChild?.getAttribute("data-film-state")).toBe(
    "loading",
  );
});
it("keeps original-watch access and allows retry after a missing frame load", () => {
  vi.useFakeTimers();
  const { container } = render(scene());
  act(() => vi.advanceTimersByTime(20001));
  expect(screen.getByRole("status").textContent).toContain("could not load");
  expect(
    screen.getByRole("link", { name: /Watch original opening/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry opening film" }));
  expect(container.querySelector("iframe")).not.toBeNull();
});
it("times out a missing document without claiming playback and cancels that timer on stop", () => {
  vi.useFakeTimers();
  const { container } = render(scene());
  act(() => vi.advanceTimersByTime(20001));
  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry opening film" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
  act(() => vi.advanceTimersByTime(20001));
  expect(screen.queryByRole("status")).toBeNull();
});

it("contains the detail poster and player in one media viewport above the controls", () => {
  const { container } = render(scene(false, false, "detail"));
  visible(true);
  const viewport = container.querySelector(".home-film-viewport");
  expect(viewport).not.toBeNull();
  expect(viewport?.contains(container.querySelector(".home-film-backup"))).toBe(
    true,
  );
  expect(viewport?.contains(container.querySelector("iframe"))).toBe(true);
  expect(
    viewport?.contains(container.querySelector(".home-film-controls")),
  ).toBe(false);
  fireEvent.load(container.querySelector("iframe")!);
  expect(container.firstElementChild?.getAttribute("data-film-playback")).toBe(
    "unverified",
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop detail film" }));
  expect(viewport?.querySelector(".home-film-backup")).not.toBeNull();
  expect(viewport?.querySelector("iframe")).toBeNull();
});

it("prepares the detail poster near the viewport without mounting the provider early", () => {
  const { container } = render(scene(false, false, "detail"));
  const poster =
    container.querySelector<HTMLImageElement>(".home-film-backup")!;
  expect(poster.getAttribute("src")).toBeNull();
  act(() =>
    prepare(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  expect(poster.getAttribute("src")).toBe("/images/gtr-premium.webp");
  expect(poster.getAttribute("loading")).toBe("eager");
  expect(container.querySelector("iframe")).toBeNull();
  visible(true);
  expect(container.querySelector("iframe")).not.toBeNull();
});

it.each(["hero", "detail"] as const)(
  "remounts %s silently after automatic offscreen reentry",
  (kind) => {
    const { container } = render(scene(false, false, kind));
    visible(true);
    const original = container.querySelector("iframe")!;
    fireEvent.load(original);
    const poster = container.querySelector(".home-film-backup");
    visible(false);
    expect(container.querySelector("iframe")).toBeNull();
    visible(true);
    expect(container.querySelector("iframe")).not.toBe(original);
    expect(container.querySelector(".home-film-backup")).toBe(poster);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector(".home-film-entry")).toBeNull();
    expect(
      container.querySelector(".home-film")?.getAttribute("data-film-document"),
    ).toBe("loading");
    expect(
      container.querySelector(".home-film")?.getAttribute("data-film-playback"),
    ).toBe("unverified");
  },
);

it("keeps the detail provider transparent and inert until its document loads", () => {
  const styles = document.createElement("style");
  styles.textContent =
    readFileSync("src/styles/home.css", "utf8") +
    readFileSync("src/styles/home-film-entry.css", "utf8");
  document.head.append(styles);
  try {
    const { container } = render(scene(false, false, "detail"));
    visible(true);
    const frame = container.querySelector("iframe")!;
    expect(getComputedStyle(frame).opacity).toBe("0");
    expect(getComputedStyle(frame).pointerEvents).toBe("none");
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    fireEvent.load(frame);
    expect(getComputedStyle(frame).opacity).toBe("1");
    expect(frame.hasAttribute("inert")).toBe(false);
    expect(
      container.querySelector(".home-film")?.getAttribute("data-film-playback"),
    ).toBe("unverified");
  } finally {
    styles.remove();
  }
});

it("suspends inline playback under an enlarged modal then silently remounts", () => {
  const renderFilm = (suspended: boolean) => (
    <MemoryRouter>
      <Film
        kind="hero"
        reducedMotion={false}
        saveData={false}
        suspended={suspended}
      />
    </MemoryRouter>
  );
  const { container, rerender } = render(renderFilm(false));
  const first = container.querySelector("iframe")!;
  fireEvent.load(first);
  rerender(renderFilm(true));
  expect(container.querySelector("iframe")).toBeNull();
  rerender(renderFilm(false));
  expect(container.querySelector("iframe")).not.toBe(first);
  expect(screen.queryByRole("status")).toBeNull();
});

it("unmounts behind another open modal and returns quietly after its removal", async () => {
  const { container } = render(scene());
  const original = container.querySelector("iframe")!;
  const modal = document.createElement("dialog");
  modal.setAttribute("open", "");
  await act(async () => document.body.append(modal));
  expect(container.querySelector("iframe")).toBeNull();
  await act(async () => modal.remove());
  expect(container.querySelector("iframe")).not.toBe(original);
  expect(screen.queryByRole("status")).toBeNull();
});

it("never reuses a removed provider document's readiness on reentry or late load", () => {
  const { container } = render(scene());
  const original = container.querySelector("iframe")!;
  fireEvent.load(original);
  visible(false);
  visible(true);
  const replacement = container.querySelector("iframe")!;
  expect(replacement).not.toBe(original);
  fireEvent.load(original);
  expect(replacement.hasAttribute("inert")).toBe(true);
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loading");
  fireEvent.load(replacement);
  expect(replacement.hasAttribute("inert")).toBe(false);
});

it("changes film identity without revealing the previous document on the replacement", () => {
  const { container, rerender } = render(scene());
  const original = container.querySelector("iframe")!;
  fireEvent.load(original);
  rerender(scene(false, false, "detail"));
  const replacement = container.querySelector("iframe")!;
  expect(replacement).not.toBe(original);
  expect(replacement.hasAttribute("inert")).toBe(true);
  fireEvent.load(original);
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loading");
  fireEvent.load(replacement);
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loaded");
});
