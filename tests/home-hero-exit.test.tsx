// @vitest-environment jsdom
import { useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroFilm } from "../src/components/home/HeroFilm";
import { useHomeMotion } from "../src/components/home/useHomeMotion";
import { heroExitAt } from "../src/components/home/motion";
import { homeFilms } from "../src/data/films";
import { readFileSync } from "node:fs";
const exitStyles = readFileSync("src/styles/home-hero-exit.css", "utf8");

const onEra = () => {};
let progress = 0;
let frame: FrameRequestCallback | undefined;
function Scene({ reducedMotion = false, saveData = false }) {
  const root = useRef<HTMLDivElement>(null);
  useHomeMotion(root, reducedMotion, onEra);
  return (
    <MemoryRouter>
      <div ref={root}>
        <HeroFilm reducedMotion={reducedMotion} saveData={saveData} />
        <section className="home-editorial">Editorial</section>
      </div>
    </MemoryRouter>
  );
}
const exit = (value: number) => {
  progress = value;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    frame?.(0);
  });
};
beforeEach(() => {
  progress = 0;
  frame = undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top =
        this.dataset.motionSection === "hero" ? -600 * progress : 1600;
      return {
        top,
        bottom: top + 1600,
        height: 1600,
        width: 1440,
        left: 0,
        right: 1440,
        x: 0,
        y: top,
        toJSON() {},
      };
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(1000);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bounded reversible hero exit", () => {
  it("keeps the first half still and smoothly eases to a bounded whole-panel fade and lift", () => {
    // A linear or early exit would move the opening. Missing clamping would overshoot on long scrolls.
    for (const value of [-1, 0, 0.3, 0.52]) {
      expect(heroExitAt(value)).toEqual({ opacity: 1, lift: 0 });
    }
    expect(heroExitAt(0.76)).toEqual({ opacity: 0.88, lift: -14 });
    for (const value of [1, 1.3, 4]) {
      expect(heroExitAt(value)).toEqual({ opacity: 0.76, lift: -28 });
    }
    expect(heroExitAt(0.53).lift).toBeGreaterThan(-0.1);
    expect(heroExitAt(0.99).lift).toBeLessThan(-27.9);
  });

  it("provides an outside-the-player paper handoff without changing the opening or provider", () => {
    const { container } = render(<Scene />);
    const hero = container.querySelector<HTMLElement>(".home-hero-runway")!;
    const handoff = hero.nextElementSibling;
    expect(handoff?.classList.contains("home-hero-handoff")).toBe(true);
    expect(handoff?.getAttribute("aria-hidden")).toBe("true");
    expect(
      handoff?.nextElementSibling?.classList.contains("home-editorial"),
    ).toBe(true);
    expect(hero.dataset.openingResolved).toBe("false");
    expect(
      hero.querySelector(".home-hero-sticky > .home-opening"),
    ).toBeTruthy();
    expect(hero.querySelector("iframe")?.src).toBe(homeFilms.hero.embed);
    expect(hero.querySelector("iframe")?.style.transform).toBe("");
    fireEvent.load(hero.querySelector("iframe")!);
    expect(hero.dataset.openingResolved).toBe("true");
    expect(
      screen
        .getByRole("link", { name: /Watch original opening/ })
        .getAttribute("href"),
    ).toBe(homeFilms.hero.page);
  });

  it("reverses through the same values without changing iframe geometry or film control tab order", () => {
    const { container } = render(<Scene />);
    const hero = container.querySelector<HTMLElement>(".home-hero-runway")!;
    const iframe = hero.querySelector("iframe")!;
    fireEvent.load(iframe);
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("1.00000");
    exit(0.76);
    expect(Number(hero.style.getPropertyValue("--copy-opacity"))).toBeCloseTo(
      1 - (0.76 - 0.3) / 0.6,
    );
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("0.88000");
    expect(hero.style.getPropertyValue("--hero-exit-lift")).toBe("-14.000px");
    exit(1);
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("0.76000");
    expect(
      screen.getByRole("button", { name: "Stop opening film" }).tabIndex,
    ).toBe(0);
    expect(
      screen.getByRole("link", { name: /Watch original opening/ }).tabIndex,
    ).toBe(0);
    exit(0.76);
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("0.88000");
    exit(0);
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("1.00000");
    expect(hero.style.getPropertyValue("--hero-exit-lift")).toBe("0.000px");
    expect(hero.querySelector("iframe")).toBe(iframe);
    expect(iframe.style.transform).toBe("");
  });

  it("allows Continue-to-heading focus to scroll out while protecting focused film controls and links", () => {
    // jsdom does not resolve custom-property transforms, but its selector engine
    // evaluates the actual production CSS rule against live focus in the DOM.
    const stylesheet = document.createElement("style");
    stylesheet.textContent = exitStyles;
    document.head.append(stylesheet);
    try {
      const rule = [...stylesheet.sheet!.cssRules].find((item) =>
        (item as CSSStyleRule).style
          ?.getPropertyValue("opacity")
          .includes("--hero-exit-opacity"),
      ) as CSSStyleRule;
      const { container } = render(<Scene />);
      const panel = container.querySelector<HTMLElement>(".home-hero-sticky")!;
      fireEvent.click(screen.getByRole("button", { name: "Continue to page" }));
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1 }),
      );
      exit(1);
      expect(panel.matches(rule.selectorText)).toBe(true);
      for (const control of [
        screen.getByRole("button", { name: "Stop opening film" }),
        screen.getByRole("link", { name: /Watch original opening/ }),
        screen.getByRole("link", { name: "Explore the models" }),
      ]) {
        act(() => control.focus());
        expect(panel.matches(rule.selectorText)).toBe(false);
      }
    } finally {
      stylesheet.remove();
    }
  });

  it("clears exit variables when reduced motion is enabled mid-scroll", () => {
    const { container, rerender } = render(<Scene />);
    const hero = container.querySelector<HTMLElement>(".home-hero-runway")!;
    exit(0.9);
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).not.toBe("");
    rerender(<Scene reducedMotion />);
    expect(hero.dataset.heroExitEnabled).toBe("false");
    expect(hero.style.getPropertyValue("--hero-exit-opacity")).toBe("");
    expect(hero.style.getPropertyValue("--hero-exit-lift")).toBe("");
  });

  it.each([{ reducedMotion: true }, { saveData: true }])(
    "disables the exit and leaves explicit film controls for policy %j",
    (policy) => {
      const { container } = render(<Scene {...policy} />);
      const hero = container.querySelector<HTMLElement>(".home-hero-runway")!;
      expect(hero.dataset.heroExitEnabled).toBe("false");
      expect(hero.dataset.openingResolved).toBe("true");
      expect(hero.querySelector("iframe")).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Play opening film" }),
      );
      expect(hero.querySelector("iframe")?.src).toBe(homeFilms.hero.embed);
      expect(hero.dataset.heroExitEnabled).toBe("false");
    },
  );
});
