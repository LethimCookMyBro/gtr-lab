// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RearSignature } from "../src/components/home/RearSignature";
let notify: IntersectionObserverCallback;
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("WebGLRenderingContext", undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const show = (props = {}) =>
  render(
    <MemoryRouter>
      <RearSignature {...props} />
    </MemoryRouter>,
  );
it("keeps the vehicle identity and caption available even before the lazy scene is ready", () => {
  show();
  expect(screen.getByRole("heading", { name: "NISSAN GT-R" })).toBeTruthy();
  expect(
    screen.getByText("Four lights. One unmistakable signature."),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Meet the family" }).getAttribute("href"),
  ).toBe("#home-lineup");
});
it("does not download the model for Save-Data until explicitly requested", () => {
  show({ saveData: true });
  act(() =>
    notify(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(
    screen.getByRole("button", { name: "Load 3D view · 8.3 MB" }),
  ).toBeTruthy();
  expect(document.querySelector("canvas")).toBeNull();
});
it("offers real model details rather than an endless spinner without WebGL", () => {
  show();
  act(() =>
    notify(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(
    screen
      .getByRole("link", { name: "Explore the R35 details" })
      .getAttribute("href"),
  ).toBe("/configurator/premium");
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});
