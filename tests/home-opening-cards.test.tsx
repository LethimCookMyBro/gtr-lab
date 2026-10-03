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
const opening = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".home-opening");
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

describe("readiness-linked metallic opening", () => {
  it("shows a Nissan GT-R opening while the hosted document is loading", () => {
    const { container } = hero();
    expect(opening(container)?.dataset.state).toBe("loading");
    expect(
      within(opening(container)!).getByRole("img", { name: "Nissan GT-R" }),
    ).toBeTruthy();
    expect(within(opening(container)!).getByRole("status").textContent).toBe(
      "Preparing the film",
    );
    expect(container.querySelector("iframe")).toBeTruthy();
  });
  it("releases immediately on iframe load without claiming actual playback", () => {
    vi.useFakeTimers();
    const { container } = hero();
    fireEvent.load(container.querySelector("iframe")!);
    expect(opening(container)?.dataset.state).toBe("resolved");
    expect(opening(container)?.getAttribute("aria-hidden")).toBe("true");
    expect(
      opening(container)
        ?.querySelector("[data-sweep]")
        ?.getAttribute("data-sweep"),
    ).toBe("false");
    expect(
      container.querySelector(".home-film")?.getAttribute("data-film-state"),
    ).toBe("embedded");
    expect(screen.queryByText(/film (is )?playing/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue to page" }),
    ).toBeNull();
  });
  it("allows an immediate keyboard skip without stopping the film or replaying the opening", async () => {
    const { container } = hero();
    const skip = screen.getByRole("button", { name: "Continue to page" });
    skip.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(opening(container)?.dataset.state).toBe("resolved");
    expect(container.querySelector("iframe")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop opening film" }));
    fireEvent.click(screen.getByRole("button", { name: "Play opening film" }));
    expect(opening(container)?.dataset.state).toBe("resolved");
  });
  it("keeps a photo behind loading film and resolves into fallback after the network timeout", () => {
    vi.useFakeTimers();
    const { container } = hero();
    expect(
      container.querySelector<HTMLImageElement>(".home-film-backup")?.hidden,
    ).toBe(false);
    act(() => vi.advanceTimersByTime(20001));
    expect(opening(container)?.dataset.state).toBe("resolved");
    expect(container.querySelector("iframe")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Retry opening film" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("could not load");
  });
  it("does not wait for a decorative animation and exits on the existing network timeout", () => {
    vi.useFakeTimers();
    const { container } = hero();
    act(() => vi.advanceTimersByTime(1500));
    expect(opening(container)?.dataset.state).toBe("loading");
    act(() => vi.advanceTimersByTime(18501));
    expect(opening(container)?.dataset.state).toBe("resolved");
    expect(
      screen.getByRole("button", { name: "Retry opening film" }),
    ).toBeTruthy();
  });
  it.each([
    [true, false],
    [false, true],
  ])(
    "bypasses the opening under reduced-motion/data-saving policy %s/%s",
    (motion, data) => {
      const { container } = hero(motion, data);
      expect(opening(container)?.dataset.state).toBe("resolved");
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
          index === 0 ? "View in 3D" : "Explore model",
        ),
      ).toBeTruthy();
    }
    expect(within(links[0]).getByText(/artist-built R35/i)).toBeTruthy();
  });
  it("moves the photograph and circular cue within the card, then resets on pointer exit", () => {
    vi.useFakeTimers();
    cards();
    const card = screen.getByRole("link", { name: "Explore Premium" });
    measureCard(card);
    movePointer(card);
    expect(card.getAttribute("data-pointer-active")).toBe("true");
    expect(card.style.getPropertyValue("--card-pointer-x")).toBe("450px");
    expect(card.style.getPropertyValue("--card-pointer-y")).toBe("100px");
    expect(
      parseFloat(card.style.getPropertyValue("--card-image-x")),
    ).toBeGreaterThan(0);
    expect(
      parseFloat(card.style.getPropertyValue("--card-image-y")),
    ).toBeLessThan(0);
    fireEvent.pointerLeave(card);
    expect(card.getAttribute("data-pointer-active")).not.toBe("true");
    expect(card.style.getPropertyValue("--card-image-x")).toBe("");
  });
  it.each(["touch", "coarse", "reduced"])(
    "does not run pointer motion for %s input",
    (input) => {
      vi.useFakeTimers();
      finePointer = input !== "coarse";
      reduced = input === "reduced";
      cards();
      const card = screen.getByRole("link", { name: "Explore Premium" });
      measureCard(card);
      movePointer(card, input === "touch" ? "touch" : "mouse");
      expect(card.getAttribute("data-pointer-active")).not.toBe("true");
      expect(card.style.getPropertyValue("--card-image-x")).toBe("");
    },
  );
  it("clears an active pointer response when reduced motion is enabled", () => {
    vi.useFakeTimers();
    cards();
    const card = screen.getByRole("link", { name: "Explore Premium" });
    measureCard(card);
    movePointer(card);
    expect(card.getAttribute("data-pointer-active")).toBe("true");
    act(() => {
      reduced = true;
      preferenceListeners.forEach((listener) => listener());
    });
    expect(card.getAttribute("data-pointer-active")).not.toBe("true");
    expect(card.style.getPropertyValue("--card-image-x")).toBe("");
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
      screen.getByRole("link", { name: "Explore Premium" }),
    );
    await userEvent.setup().keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Premium model" })).toBeTruthy();
  });
});
