// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { Film } from "../src/components/home/Film";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "../src/pages/HomePage";
import { SiteLayout } from "../src/components/layout/SiteLayout";
import { AudioProvider } from "../src/hooks/useAudio";

let reduced = false;
let saveData = false;
let compactHeight = false;
const intersections: IntersectionObserverCallback[] = [];
beforeEach(() => {
  reduced = false;
  saveData = false;
  compactHeight = false;
  intersections.length = 0;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("max-height") ? compactHeight : reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    get: () => ({ saveData }),
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersections.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("pause"));
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  document.documentElement.style.scrollPaddingTop = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = () =>
  render(
    <MemoryRouter>
      <AudioProvider>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route path="/models" element={<h1>Model collection</h1>} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );

describe("cinematic homepage", () => {
  it("contains two real native films and all six full-row model destinations", () => {
    const { container } = setup();
    expect(container.querySelectorAll("video")).toHaveLength(2);
    for (const film of container.querySelectorAll("video")) {
      expect(film.muted).toBe(true);
      expect(film.loop).toBe(true);
      expect(film.playsInline).toBe(true);
    }
    const invitations = screen.getByRole("navigation", {
      name: "Explore all six models",
    });
    for (const [id, name] of [
      ["premium", "Premium"],
      ["nismo", "NISMO"],
      ["tspec", "T-spec"],
      ["gtr50", "GT-R50"],
      ["gt3", "GT3"],
      ["gt500", "GT500"],
    ]) {
      expect(
        within(invitations)
          .getByRole("link", { name: `Explore ${name}` })
          .getAttribute("href"),
      ).toBe(`/configurator/${id}`);
    }
    expect(
      screen
        .getByRole("link", { name: "Explore the models" })
        .getAttribute("href"),
    ).toBe("/models");
  });
  it("starts with paused film controls for reduced-motion visitors", () => {
    reduced = true;
    const { container } = setup();
    expect(container.querySelector("video")?.autoplay).toBe(false);
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(
      container
        .querySelector(".cinematic-home")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("true");
  });
  it("does not autoplay or preload film data with Save-Data enabled", () => {
    saveData = true;
    const { container } = setup();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(container.querySelector("video")?.preload).toBe("none");
  });
  it("updates playback controls from actual media events and permits explicit play", async () => {
    reduced = true;
    const { container } = setup();
    const video = container.querySelector("video")!;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Play opening film" }));
    expect(
      screen.getByRole("button", { name: "Pause opening film" }),
    ).toBeTruthy();
    fireEvent.pause(video);
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
  });
  it("keeps rejected playback honest and media errors visible", async () => {
    reduced = true;
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException("Blocked", "NotAllowedError"),
    );
    const { container } = setup();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Play opening film" }));
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
    fireEvent.error(container.querySelector("video")!);
    expect(
      screen
        .getByRole("link", { name: /Still photograph.*Photography credits/ })
        .getAttribute("href"),
    ).toBe("/credits");
    expect(
      screen.getByText("Opening film unavailable. Showing a still photograph."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Opening film unavailable",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("ignores a late playing event after the document becomes hidden", async () => {
    reduced = true;
    let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { container } = setup();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Play opening film" }));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      fireEvent.playing(container.querySelector("video")!);
      resolve();
    });
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
  });

  it("does not let an obsolete autoplay promise pause a new StrictMode attempt", async () => {
    const resolutions: Array<() => void> = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      this.dispatchEvent(new Event("playing"));
      return new Promise<void>((done) => resolutions.push(done));
    });
    render(
      <MemoryRouter>
        <StrictMode>
          <Film kind="hero" reducedMotion={false} saveData={false} />
        </StrictMode>
      </MemoryRouter>,
    );
    await act(async () => resolutions.forEach((resolve) => resolve()));
    expect(
      screen.getByRole("button", { name: "Pause opening film" }),
    ).toBeTruthy();
  });

  it("lets the user cancel playback while the real playing event is still pending", async () => {
    reduced = true;
    let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { container } = setup();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Play opening film" }));
    expect(
      container
        .querySelector(".home-film--hero")
        ?.getAttribute("data-film-state"),
    ).toBe("loading");
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Cancel opening film loading" }),
      );
    await act(async () => {
      resolve();
      fireEvent.playing(container.querySelector("video")!);
    });
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
    expect(
      container
        .querySelector(".home-film--hero")
        ?.getAttribute("data-film-state"),
    ).toBe("paused");
  });
  it("ignores a queued pause from an older attempt while a new native play is pending", async () => {
    let nativePaused = true;
    const resolutions: Array<() => void> = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, "paused", {
        configurable: true,
        get: () => nativePaused,
      });
      nativePaused = false;
      return new Promise<void>((resolve) => resolutions.push(resolve));
    });
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(() => {
      nativePaused = true;
    });
    const { container } = render(
      <MemoryRouter>
        <StrictMode>
          <Film kind="hero" reducedMotion={false} saveData={false} />
        </StrictMode>
      </MemoryRouter>,
    );
    const video = container.querySelector("video")!;
    expect(
      screen.getByRole("button", { name: "Cancel opening film loading" }),
    ).toBeTruthy();
    fireEvent.pause(video);
    expect(video.paused).toBe(false);
    expect(
      screen.getByRole("button", { name: "Cancel opening film loading" }),
    ).toBeTruthy();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Cancel opening film loading" }),
      );
    await act(async () => {
      resolutions.forEach((resolve) => resolve());
      fireEvent.playing(video);
    });
    expect(video.paused).toBe(true);
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
  });
  it("uses sequential navigation on short viewports without disabling normal film autoplay", async () => {
    compactHeight = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 900,
      bottom: 1200,
      height: 300,
      left: 0,
      right: 400,
      width: 400,
      x: 0,
      y: 900,
      toJSON: () => ({}),
    });
    document.documentElement.style.scrollPaddingTop = "100px";
    const { container } = setup();
    expect(
      container
        .querySelector(".cinematic-home")
        ?.getAttribute("data-sequential-motion"),
    ).toBe("true");
    expect(
      container
        .querySelector(".cinematic-home")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Pause opening film" }),
    ).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "2007: R35 GT-R" }));
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 666,
      behavior: "instant",
    });
    expect(
      screen
        .getByRole("button", { name: "2007: R35 GT-R" })
        .getAttribute("aria-current"),
    ).toBe("step");
  });
  it("opens an accessible menu, traps focus, closes on Escape and restores focus", async () => {
    setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Explore GT-R LAB" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByRole("link", { name: "Models" })).toBeTruthy();
    const last = within(dialog).getByRole("link", {
      name: "Credits & sources",
    });
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Close menu" }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });
  it("offers a keyboard-operable era timeline and a working back-to-top", async () => {
    setup();
    const timeline = screen.getByRole("navigation", { name: "GT-R eras" });
    expect(within(timeline).getAllByRole("button")).toHaveLength(3);
    expect(
      within(timeline)
        .getByRole("button", { name: "1969: Skyline GT-R" })
        .getAttribute("aria-current"),
    ).toBe("step");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Back to top" }));
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });
});
