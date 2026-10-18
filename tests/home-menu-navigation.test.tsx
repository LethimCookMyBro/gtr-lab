// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HomeHeader } from "../src/components/layout/SiteLayout";
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function show() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeHeader />} />
        <Route path="/models" element={<h1>Models destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  screen.getByRole("button", { name: "Open menu" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
}
it("finishes the visible close transition before navigating", () => {
  show();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("link", {
      name: "Models",
      exact: true,
    }),
  );
  expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("closing");
  expect(
    screen.queryByRole("heading", { name: "Models destination" }),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(259));
  expect(screen.getByRole("dialog")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.getByRole("heading", { name: "Models destination" }),
  ).toBeTruthy();
  expect(document.body.style.overflow).toBe("");
});
it("navigates immediately under reduced motion", () => {
  reduced = true;
  show();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("link", {
      name: "Models",
      exact: true,
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Models destination" }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps modified link clicks native and the menu open", () => {
  show();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("link", {
      name: "Models",
      exact: true,
    }),
    { ctrlKey: true },
  );
  expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("open");
});
it("Escape closes with restored trigger focus", () => {
  show();
  fireEvent.keyDown(document, { key: "Escape" });
  act(() => vi.advanceTimersByTime(260));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open menu" }),
  );
});
