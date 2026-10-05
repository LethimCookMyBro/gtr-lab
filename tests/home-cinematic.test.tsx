// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
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
  it("keeps four complete exhibition stories visible while the era rail changes", () => {
    const scene = (activeEra: number) => (
      <MemoryRouter>
        <HeritageJourney
          activeEra={activeEra}
          onEra={() => {}}
          sequentialMotion={false}
        />
      </MemoryRouter>
    );
    const { container, rerender } = render(scene(0));
    for (const index of [0, 1, 2, 3, 0]) {
      rerender(scene(index));
      const chapters = [
        ...container.querySelectorAll<HTMLElement>(".home-archive-chapter"),
      ];
      expect(chapters).toHaveLength(4);
      for (const chapter of chapters) {
        expect(
          within(chapter).getByRole("heading", { level: 3 }).textContent,
        ).not.toBe("");
        expect(
          chapter.querySelectorAll(".home-timeline-image img"),
        ).toHaveLength(1);
        expect(chapter.querySelectorAll("details img")).toHaveLength(3);
      }
      expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(
        1,
      );
      expect(
        container
          .querySelector('[aria-current="step"]')
          ?.getAttribute("aria-label"),
      ).toContain(["1969", "1989", "1999", "2007"][index]);
      expect(container.querySelector(".home-archive-narrative")).toBeNull();
      expect(
        [...container.querySelectorAll(".home-archive-year")].map(
          (year) => year.textContent,
        ),
      ).toEqual(["1969", "1989", "1999", "2007"]);
    }
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
          .getByRole("link", {
            name: `Explore ${name}: ${id === "premium" ? "View in 3D" : "View photos"}`,
          })
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
      top: 776,
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
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Continue without 3D" }));
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
    expect(dialog.getAttribute("data-phase")).toBe("closing");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe("");
  });
  it("provides truthful footer context and direct links to all six variants", () => {
    setup();
    const footer = document.querySelector(".home-footer") as HTMLElement;
    expect(
      within(footer).getByText(/independent digital exhibition/i),
    ).toBeTruthy();
    for (const id of ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"]) {
      expect(
        footer.querySelector(`a[href="/configurator/${id}"]`),
      ).toBeTruthy();
    }
  });
  it("restores the real rear signature without fabricated rings or photographic zoom", () => {
    setup();
    expect(document.querySelector(".home-signature-rings")).toBeNull();
    expect(document.querySelector(".home-signature-photo")).toBeNull();
    expect(document.querySelector(".home-signature-runway")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "NISSAN GT-R" })).toBeTruthy();
  });
  it("offers a keyboard-operable era timeline and a working back-to-top", async () => {
    setup();
    const timeline = screen.getByRole("navigation", { name: "GT-R eras" });
    expect(
      within(timeline)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "1969: PGC10 Skyline GT-R",
      "1989: R32 GT-R",
      "1999: R34 GT-R",
      "2007: R35 GT-R",
    ]);
    expect(
      within(timeline)
        .getByRole("button", { name: "1969: PGC10 Skyline GT-R" })
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
