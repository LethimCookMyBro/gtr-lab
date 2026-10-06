// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HeroFilm } from "../src/components/home/HeroFilm";
import { ModelInvitations } from "../src/components/home/ModelInvitations";

let reduced = false;
let finePointer = true;
const preferenceListeners = new Set<() => void>();
beforeEach(() => {
  reduced = false;
  finePointer = true;
  preferenceListeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("reduced-motion") ? reduced : finePointer;
    },
    addEventListener: (_: string, listener: () => void) =>
      preferenceListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      preferenceListeners.delete(listener),
  }));
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const hero = (reducedMotion = false, saveData = false) =>
  render(
    <MemoryRouter>
      <HeroFilm reducedMotion={reducedMotion} saveData={saveData} />
    </MemoryRouter>,
  );
const cards = () =>
  render(
    <MemoryRouter>
      <ModelInvitations />
    </MemoryRouter>,
  );
const measureCard = (card: HTMLElement) =>
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 100,
    width: 600,
    height: 400,
    right: 700,
    bottom: 500,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
const movePointer = (card: HTMLElement, pointerType = "mouse") => {
  fireEvent.pointerMove(card, { clientX: 550, clientY: 200, pointerType });
  act(() => vi.advanceTimersByTime(32));
};

describe("hero delegates whole-page readiness", () => {
  it("preloads the hosted player without claiming the parent's opening is ready", () => {
    const ready = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <HeroFilm
          reducedMotion={false}
          saveData={false}
          openingResolved={false}
          onVisualReady={ready}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector(".home-opening")).toBeNull();
    expect(
      container
        .querySelector(".home-hero-runway")
        ?.getAttribute("data-opening-resolved"),
    ).toBe("false");
    expect(ready).not.toHaveBeenCalled();
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute("inert")).toBe(true);
    fireEvent.load(frame!);
    expect(ready).not.toHaveBeenCalled();
    // The parent owns readiness; a provider document cannot release its gate.
    expect(
      container
        .querySelector(".home-hero-runway")
        ?.getAttribute("data-opening-resolved"),
    ).toBe("false");
    expect(screen.queryByText(/film (is )?playing/i)).toBeNull();
  });
  it("keeps the real local photograph available while the film times out", () => {
    vi.useFakeTimers();
    const { container } = hero();
    expect(
      container.querySelector<HTMLImageElement>(".home-film-backup")?.hidden,
    ).toBe(false);
    act(() => vi.advanceTimersByTime(20001));
    expect(container.querySelector("iframe")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Retry opening film" }),
    ).toBeTruthy();
  });
  it.each([
    [true, false],
    [false, true],
  ])(
    "retains explicit film controls for reduced-motion/data policy %s/%s",
    (motion, data) => {
      const { container } = hero(motion, data);
      expect(container.querySelector("iframe")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Play opening film" }),
      ).toBeTruthy();
    },
  );
});

describe("truthful spatial model invitations", () => {
  it("offers 3D only for the available Premium asset and keeps six real destinations", () => {
    cards();
    const nav = screen.getByRole("navigation", {
      name: "Explore all six models",
    });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const [index, id] of [
      "premium",
      "nismo",
      "tspec",
      "gtr50",
      "gt3",
      "gt500",
    ].entries()) {
      expect(links[index].getAttribute("href")).toBe(`/configurator/${id}`);
      expect(links[index].getAttribute("data-experience")).toBe(
        index === 0 ? "3d" : "photography",
      );
      expect(
        within(links[index]).getByText(
          index === 0 ? "View in 3D" : "View photos",
        ),
      ).toBeTruthy();
    }
    expect(links[0].hasAttribute("aria-describedby")).toBe(false);
    expect(document.querySelector("#home-model-asset-note")).toBeNull();
  });
  it("keeps one quiet action and no cursor-following bubble on every card", () => {
    const { container } = cards();
    expect(container.querySelector(".home-invitation-cursor")).toBeNull();
    expect(container.querySelector(".home-invitation-meta")).toBeNull();
    expect(container.querySelector(".home-invitation-copy p")).toBeNull();
    for (const card of container.querySelectorAll(".home-model-invitation")) {
      expect(card.querySelectorAll(".home-invitation-cta")).toHaveLength(1);
      expect(card.querySelectorAll("h3")).toHaveLength(1);
    }
  });
  it("keeps each card as one keyboard-operable link with a truthful destination", async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ModelInvitations />} />
          <Route
            path="/configurator/premium"
            element={<h1>Premium model</h1>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Explore Premium: View in 3D" }),
    );
    await userEvent.setup().keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Premium model" })).toBeTruthy();
  });
});
