// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useLayoutEffect } from "react";
import { Drawer } from "../src/components/ui/Drawer";
import { MemoryRouter } from "react-router-dom";
import { ConfiguratorPanels } from "../src/components/configurator/ConfiguratorPanels";
import { models } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  useConfigurator.getState().reset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: reduced,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup() {
  render(
    <MemoryRouter>
      <button onClick={() => useConfigurator.getState().togglePanel("camera")}>
        Open camera
      </button>
      <ConfiguratorPanels model={models[0]} interactive />
    </MemoryRouter>,
  );
  const trigger = screen.getByRole("button", { name: "Open camera" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}
it("keeps the closing drawer present until its exit finishes, then restores focus", () => {
  const trigger = setup();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("closing");
  expect(document.activeElement).not.toBe(trigger);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("cancels a pending close when a newer panel opens", () => {
  setup();
  fireEvent.keyDown(document, { key: "Escape" });
  act(() => useConfigurator.getState().togglePanel("environment"));
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole("dialog").getAttribute("data-phase")).toBe("open");
  expect(screen.getByRole("dialog").textContent).toContain(
    "Change the atmosphere.",
  );
});
it("dismisses immediately for reduced motion", () => {
  reduced = true;
  const trigger = setup();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("handles Escape as soon as a drawer is committed and exposed", () => {
  const onClose = vi.fn();
  function CommitProbe() {
    useLayoutEffect(() => {
      // The dialog already exists before passive effects can run.
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }, []);
    return (
      <Drawer title="Immediate Escape" onClose={onClose}>
        Options
      </Drawer>
    );
  }
  render(<CommitProbe />);
  expect(onClose).toHaveBeenCalledTimes(1);
});
