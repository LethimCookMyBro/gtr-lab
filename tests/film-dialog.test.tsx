// @vitest-environment jsdom
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ExpandingFilm } from "../src/components/home/ExpandingFilm";
import { homeFilms } from "../src/data/films";

let observe: IntersectionObserverCallback;
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeEach(() => {
  // jsdom does not implement the native dialog top layer; browser tests cover its focus trap.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observe = callback;
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
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});
afterAll(() => {
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
const scene = (reducedMotion = false, saveData = false) =>
  render(
    <MemoryRouter>
      <ExpandingFilm reducedMotion={reducedMotion} saveData={saveData} />
    </MemoryRouter>,
  );
const intersect = () =>
  act(() =>
    observe(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
const visibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
};

it("suspends the ambient player while the exact credited publisher film is enlarged", async () => {
  const { container } = scene();
  intersect();
  const ambient = container.querySelector(".home-film--detail iframe")!;
  expect(ambient).not.toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Enlarge driving film" }));
  const dialog = screen.getByRole("dialog", { name: "GT-R driving film" });
  expect(ambient.isConnected).toBe(false);
  expect(container.querySelector(".home-film--detail iframe")).toBeNull();
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  expect(dialog.querySelector("iframe")?.getAttribute("src")).toBe(
    homeFilms.detail.embed,
  );
  expect(
    within(dialog)
      .getByRole("link", { name: /Original on Flixel/ })
      .getAttribute("href"),
  ).toBe(homeFilms.detail.page);
  expect(dialog.textContent).toContain("short track loop");
});

it.each([
  [true, false],
  [false, true],
])(
  "requires an explicit enlarge action under motion/data policy %s/%s",
  async (reduced, save) => {
    const { container } = scene(reduced, save);
    intersect();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Enlarge driving film" }),
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Close driving film" }),
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
  },
);

it("removes the enlarged iframe on cancel and returns focus without discarding an existing scroll lock", async () => {
  const { container } = scene(true);
  const trigger = screen.getByRole("button", { name: "Enlarge driving film" });
  document.body.style.overflow = "clip";
  await userEvent.setup().click(trigger);
  expect(document.body.style.overflow).toBe("hidden");
  const dialog = screen.getByRole("dialog", { name: "GT-R driving film" });
  within(dialog).getByRole("button", { name: "Close driving film" }).focus();
  const iframe = dialog.querySelector("iframe")!;
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(iframe.isConnected).toBe(false);
  expect(container.querySelectorAll("iframe")).toHaveLength(0);
  expect(
    screen.queryByRole("dialog", { name: "GT-R driving film" }),
  ).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("clip");
});

it("preserves a manually stopped ambient film through repeated open and close", async () => {
  const { container } = scene();
  intersect();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Stop detail film" }));
  for (let attempt = 0; attempt < 2; attempt++) {
    await user.click(
      screen.getByRole("button", { name: "Enlarge driving film" }),
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Close driving film" }),
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Play detail film" }),
    ).toBeTruthy();
  }
});

it("unloads a hidden dialog player and never revives a dialog closed while hidden", async () => {
  const { container } = scene(true);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Enlarge driving film" }),
  );
  visibility("hidden");
  expect(container.querySelectorAll("iframe")).toHaveLength(0);
  visibility("visible");
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  visibility("hidden");
  await user.click(screen.getByRole("button", { name: "Close driving film" }));
  visibility("visible");
  expect(container.querySelectorAll("iframe")).toHaveLength(0);
});

it("restores body scrolling if the enlarged view unmounts during navigation", async () => {
  const { unmount } = scene();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Enlarge driving film" }));
  expect(document.body.style.overflow).toBe("hidden");
  unmount();
  expect(document.body.style.overflow).toBe("");
  expect(document.querySelector(".home-film-dialog iframe")).toBeNull();
});

it("wraps both keyboard Tab boundaries inside the enlarged film dialog", async () => {
  scene(true);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Enlarge driving film" }),
  );
  const dialog = screen.getByRole("dialog", { name: "GT-R driving film" });
  const close = within(dialog).getByRole("button", {
    name: "Close driving film",
  });
  const original = within(dialog).getByRole("link", {
    name: /Original on Flixel/,
  });
  close.focus();
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(original);
  await user.tab();
  expect(document.activeElement).toBe(close);
});
