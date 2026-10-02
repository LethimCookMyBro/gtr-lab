// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
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
  it("renders a single decorative year while era photographs transition", async () => {
    const onEra = vi.fn();
    const scene = (activeEra: number) => (
      <MemoryRouter>
        <HeritageJourney
          activeEra={activeEra}
          onEra={onEra}
          sequentialMotion={false}
        />
      </MemoryRouter>
    );
    const { container, rerender } = render(scene(0));
    const years = container.querySelector(".home-heritage-years")!;
    expect(years.children).toHaveLength(1);
    expect(years.textContent).toBe("1969");
    rerender(scene(2));
    expect(years.children).toHaveLength(1);
    expect(years.textContent).toBe("2007");
  });
  it("lets actual scroll progress select the visible era during normal timeline navigation", async () => {
    const onEra = vi.fn();
    render(
      <MemoryRouter>
        <HeritageJourney activeEra={0} onEra={onEra} sequentialMotion={false} />
      </MemoryRouter>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "2007: R35 GT-R" }));
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
    expect(onEra).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "1969: Skyline GT-R" })
        .getAttribute("aria-current"),
    ).toBe("step");
  });
  it("contains two hosted-film sections and all six full-row model destinations", () => {
    const { container } = setup();
    expect(container.querySelectorAll(".home-film")).toHaveLength(2);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
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
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Play opening film" }),
    ).toBeTruthy();
    expect(
      container
        .querySelector(".cinematic-home")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("true");
  });
  it("does not autoplay or preload film data with Save-Data enabled", () => {
    saveData = true;
    const { container } = setup();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(
      container
        .querySelector(".cinematic-home")
        ?.getAttribute("data-sequential-motion"),
    ).toBe("false");
  });
  it.each([667, 700, 740, 844, 932])(
    "retains scroll staging in a normal-motion portrait viewport of %ipx",
    (height) => {
      vi.mocked(matchMedia).mockImplementation(
        (query) =>
          ({
            matches: query.includes("max-height")
              ? height <= Number(query.match(/max-height:\s*(\d+)/)?.[1] || 0)
              : false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
      const { container } = setup();
      expect(
        container
          .querySelector(".cinematic-home")
          ?.getAttribute("data-sequential-motion"),
      ).toBe("false");
    },
  );
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
      screen.getByRole("button", { name: "Stop opening film" }),
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
