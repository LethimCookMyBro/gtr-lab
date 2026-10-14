// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Film } from "../src/components/home/Film";
import { homeFilms } from "../src/data/films";

let visibility: IntersectionObserverCallback;
let styles: HTMLStyleElement;
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        if (!options?.rootMargin) visibility = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  styles = document.createElement("style");
  styles.textContent = [
    "home.css",
    "home-opening-cards.css",
    "home-film-entry.css",
  ]
    .map((name) => readFileSync(`src/styles/${name}`, "utf8"))
    .join("\n");
  document.head.append(styles);
});
afterEach(() => {
  cleanup();
  styles.remove();
  vi.unstubAllGlobals();
});
const enter = (visible: boolean) =>
  act(() =>
    visibility(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );

it.each(["hero", "detail"] as const)(
  "does not cover the decoded %s poster with an app-owned background after an empty document load",
  async (kind) => {
    const { container } = render(
      <MemoryRouter>
        <Film kind={kind} reducedMotion={false} saveData={false} />
      </MemoryRouter>,
    );
    enter(true);
    const poster =
      container.querySelector<HTMLImageElement>(".home-film-backup")!;
    Object.defineProperty(poster, "complete", { value: true });
    Object.defineProperty(poster, "naturalWidth", { value: 1600 });
    poster.decode = () => Promise.resolve();
    await act(async () => fireEvent.load(poster));
    const film = container.querySelector(".home-film")!;
    const frame = container.querySelector<HTMLIFrameElement>("iframe")!;
    expect(film.getAttribute("data-film-poster")).toBe("decoded");
    expect(getComputedStyle(frame).opacity).toBe("0");
    // A blocked/error navigation can emit load without a playable first frame.
    // No provider video or playback event is installed or simulated in this case.
    fireEvent.load(frame);
    expect(film.getAttribute("data-film-document")).toBe("loaded");
    expect(film.getAttribute("data-film-playback")).toBe("unverified");
    expect(getComputedStyle(frame).opacity).toBe("1");
    expect(getComputedStyle(frame).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(poster.hidden).toBe(false);
    expect(getComputedStyle(poster).display).not.toBe("none");
    expect(
      poster.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(frame.getAttribute("src")).toBe(homeFilms[kind].embed);
    expect(frame.getAttribute("allow")).toBe("autoplay; fullscreen");
    enter(false);
    expect(container.querySelector("iframe")).toBeNull();
    enter(true);
    const next = container.querySelector<HTMLIFrameElement>("iframe")!;
    expect(next).not.toBe(frame);
    expect(container.querySelector(".home-film-backup")).toBe(poster);
    fireEvent.load(next);
    expect(getComputedStyle(next).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(container.querySelector(".home-film-entry")).toBeNull();
    expect(film.getAttribute("data-film-playback")).toBe("unverified");
  },
);
