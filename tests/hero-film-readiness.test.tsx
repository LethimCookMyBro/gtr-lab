// @vitest-environment jsdom
import { StrictMode } from "react";
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
) =>
  render(
    <MemoryRouter>
      <StrictMode>
        <HeroFilm
          reducedMotion={reducedMotion}
          saveData={saveData}
          onVisualReady={onVisualReady}
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
