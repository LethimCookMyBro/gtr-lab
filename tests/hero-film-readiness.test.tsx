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
import { HeroFilm } from "../src/components/home/HeroFilm";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
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
const show = (
  onVisualReady = vi.fn(),
  reducedMotion = false,
  saveData = false,
  openingResolved = true,
) =>
  render(
    <MemoryRouter>
      <StrictMode>
        <HeroFilm
          reducedMotion={reducedMotion}
          saveData={saveData}
          onVisualReady={onVisualReady}
          openingResolved={openingResolved}
        />
      </StrictMode>
    </MemoryRouter>,
  );

it("keeps document loading separate from playback and exposes recovery immediately", () => {
  const { container } = show();
  const film = container.querySelector(".home-film")!;
  expect(film.getAttribute("data-film-document")).toBe("loading");
  expect(film.getAttribute("data-film-playback")).toBe("unverified");
  expect(screen.getByRole("status").textContent).toMatch(/loading.*player/i);
  expect(
    screen.getByRole("button", { name: "Retry opening film" }),
  ).toBeTruthy();
});

it("never reports an iframe load as a usable image or actual video playback", () => {
  const ready = vi.fn();
  const { container } = show(ready);
  fireEvent.load(container.querySelector("iframe")!);
  expect(ready).not.toHaveBeenCalled();
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loaded");
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-playback"),
  ).toBe("unverified");
  expect(screen.getByRole("status").textContent).toMatch(/not moving.*retry/i);
  expect(
    container.querySelector<HTMLImageElement>(".home-film-backup")?.hidden,
  ).toBe(false);
});

it("accepts only a decoded poster as image readiness without certifying playback", async () => {
  const ready = vi.fn();
  const { container } = show(ready);
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  let finish!: () => void;
  image.decode = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  fireEvent.load(image);
  expect(ready).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(ready).toHaveBeenCalledOnce();
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-playback"),
  ).toBe("unverified");
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-poster"),
  ).toBe("decoded");
});

it("does not accept a poster whose decode rejects", async () => {
  const ready = vi.fn();
  const { container } = show(ready);
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  image.decode = () => Promise.reject(new Error("decode failed"));
  await act(async () => fireEvent.load(image));
  expect(ready).not.toHaveBeenCalled();
});

it("retries a loaded-but-unverified document with a fresh bounded load deadline", () => {
  vi.useFakeTimers();
  const { container } = show();
  const first = container.querySelector("iframe")!;
  fireEvent.load(first);
  act(() => vi.advanceTimersByTime(30000));
  expect(container.querySelector("iframe")).toBe(first);
  fireEvent.click(screen.getByRole("button", { name: "Retry opening film" }));
  const second = container.querySelector("iframe")!;
  expect(second).not.toBe(first);
  fireEvent.load(first);
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loading");
  act(() => vi.advanceTimersByTime(19999));
  expect(container.querySelector("iframe")).toBe(second);
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/could not load/i);
});

it.each([
  [true, false],
  [false, true],
])(
  "does not request playback until manual play under policy %s/%s",
  (reducedMotion, saveData) => {
    const { container } = show(vi.fn(), reducedMotion, saveData);
    const film = container.querySelector(".home-film")!;
    expect(film.getAttribute("data-film-playback")).toBe("inactive");
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(film.getAttribute("data-film-playback")).toBe("unverified");
    fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(film.getAttribute("data-film-playback")).toBe("inactive");
  },
);

it("uses the licensed campaign poster rather than the rejected brick-wall fallback", () => {
  const { container } = show();
  const image = container.querySelector<HTMLImageElement>(".home-film-backup")!;
  expect(image.getAttribute("src")).toBe(
    "/media/campaign-r35-orange-hero.webp",
  );
  expect(image.alt).toMatch(/orange.*R35/i);
});

it("does not consume the film load deadline behind the opening gate", () => {
  vi.useFakeTimers();
  const { container, rerender } = show(vi.fn(), false, false, false);
  expect(container.querySelector("iframe")).toBeNull();
  act(() => vi.advanceTimersByTime(30000));
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-state"),
  ).toBe("stopped");
  rerender(
    <MemoryRouter>
      <StrictMode>
        <HeroFilm reducedMotion={false} saveData={false} openingResolved />
      </StrictMode>
    </MemoryRouter>,
  );
  expect(container.querySelector("iframe")).not.toBeNull();
  expect(
    container.querySelector(".home-film")?.getAttribute("data-film-document"),
  ).toBe("loading");
  act(() => vi.advanceTimersByTime(19999));
  expect(container.querySelector("iframe")).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/could not load/i);
});

it("decodes the poster independently while the opening gate suspends the film", async () => {
  const ready = vi.fn();
  const { container } = show(ready, false, false, false);
  const poster =
    container.querySelector<HTMLImageElement>(".home-film-backup")!;
  Object.defineProperty(poster, "complete", { value: true });
  Object.defineProperty(poster, "naturalWidth", { value: 1200 });
  poster.decode = () => Promise.resolve();
  await act(async () => fireEvent.load(poster));
  expect(ready).toHaveBeenCalledOnce();
  expect(container.querySelector("iframe")).toBeNull();
});

it("keeps the loading provider transparent over its poster without claiming playback", () => {
  const styles = document.createElement("style");
  styles.textContent = ["home.css", "home-opening-cards.css"]
    .map((file) => readFileSync(`src/styles/${file}`, "utf8"))
    .join("\n");
  document.head.append(styles);
  try {
    const { container } = show();
    const frame = container.querySelector("iframe")!;
    const poster = container.querySelector(".home-film-backup")!;
    expect(getComputedStyle(frame).opacity).toBe("0");
    expect(getComputedStyle(frame).pointerEvents).toBe("none");
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(poster).opacity).toBe("1");
    // Keep layout intact: display:none can change provider visibility/autoplay.
    expect(getComputedStyle(frame).display).toBe("block");
    fireEvent.load(frame);
    expect(getComputedStyle(frame).opacity).toBe("1");
    expect(frame.hasAttribute("inert")).toBe(false);
    expect(frame.hasAttribute("aria-hidden")).toBe(false);
    expect(
      container.querySelector(".home-film")?.getAttribute("data-film-playback"),
    ).toBe("unverified");
    fireEvent.click(screen.getByRole("button", { name: "Retry opening film" }));
    expect(getComputedStyle(container.querySelector("iframe")!).opacity).toBe(
      "0",
    );
  } finally {
    styles.remove();
  }
});
