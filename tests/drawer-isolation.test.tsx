// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Drawer } from "../src/components/ui/Drawer";

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
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
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const trigger = document.createElement("button");
  trigger.textContent = "Outside trigger";
  document.body.append(trigger);
  trigger.focus();
  return trigger;
}
const panel = (open = true) => (
  <Drawer title="Options" open={open} onClose={() => {}}>
    <button>Inside option</button>
  </Drawer>
);

it("isolates every ancestor sibling before paint without making the drawer inert", () => {
  const trigger = fixture();
  function CommitProbe() {
    useLayoutEffect(() => {
      expect(trigger.hasAttribute("inert")).toBe(true);
      expect(screen.getByTestId("header").hasAttribute("inert")).toBe(true);
      expect(screen.getByTestId("scene").hasAttribute("inert")).toBe(true);
      expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
    }, []);
    return (
      <>
        <header data-testid="header">Navigation</header>
        <main>
          <div data-testid="scene">Scene controls</div>
          {panel()}
        </main>
      </>
    );
  }
  render(<CommitProbe />);
});

it("locks both document scrolling elements while keeping the sheet scrollable", () => {
  render(panel());
  for (const element of [document.documentElement, document.body]) {
    expect(element.style.overflow).toBe("hidden");
    expect(element.style.getPropertyPriority("overflow")).toBe("important");
  }
  expect(
    screen
      .getByRole("dialog")
      .querySelector(".drawer-body")
      ?.getAttribute("style"),
  ).toBeNull();
});

it("holds isolation through the entire exit and then restores focus and state", () => {
  const trigger = fixture();
  const view = render(panel());
  view.rerender(panel(false));
  act(() => vi.advanceTimersByTime(279));
  expect(screen.getByRole("dialog").dataset.phase).toBe("closing");
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(document.body.getAttribute("style")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("restores exact prior inert attributes and root/body styles on unmount", () => {
  const trigger = fixture();
  const alreadyInert = document.createElement("aside");
  alreadyInert.setAttribute("inert", "existing-owner");
  document.body.append(alreadyInert);
  const bodyStyle =
    "color: red; overflow-x: scroll !important; overflow-y: auto;";
  const htmlStyle = "overflow: clip !important; scroll-behavior: smooth;";
  document.body.setAttribute("style", bodyStyle);
  document.documentElement.setAttribute("style", htmlStyle);
  const view = render(panel());
  expect(trigger.hasAttribute("inert")).toBe(true);
  view.unmount();
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(alreadyInert.getAttribute("inert")).toBe("existing-owner");
  expect(document.body.getAttribute("style")).toBe(bodyStyle);
  expect(document.documentElement.getAttribute("style")).toBe(htmlStyle);
  expect(document.activeElement).toBe(trigger);
});

it("preserves unrelated style changes made while the modal owns overflow", () => {
  document.body.style.setProperty("overflow-y", "scroll", "important");
  const view = render(panel());
  expect(document.body.style.overflow).toBe("hidden");
  document.body.style.setProperty("color", "blue");
  view.unmount();
  expect(document.body.style.getPropertyValue("overflow-y")).toBe("scroll");
  expect(document.body.style.getPropertyPriority("overflow-y")).toBe(
    "important",
  );
  expect(document.body.style.getPropertyValue("overflow-x")).toBe("");
  expect(document.body.style.color).toBe("blue");
});

it("cleans up and reacquires safely under StrictMode", () => {
  const trigger = fixture();
  const view = render(<StrictMode>{panel()}</StrictMode>);
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
  view.unmount();
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(document.documentElement.getAttribute("style")).toBeNull();
  expect(document.body.getAttribute("style")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("does not release isolation when a closing drawer reopens", () => {
  const trigger = fixture();
  const view = render(panel());
  view.rerender(panel(false));
  act(() => vi.advanceTimersByTime(120));
  view.rerender(panel());
  act(() => vi.advanceTimersByTime(300));
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("dialog").dataset.phase).toBe("open");
});

it("restores immediately on reduced-motion close", () => {
  reduced = true;
  const trigger = fixture();
  const view = render(panel());
  expect(trigger.hasAttribute("inert")).toBe(true);
  view.rerender(panel(false));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("isolates dynamically inserted background branches and stops observing after unmount", async () => {
  const view = render(panel());
  const late = document.createElement("button");
  await act(async () => {
    document.body.append(late);
  });
  expect(late.hasAttribute("inert")).toBe(true);
  view.unmount();
  expect(late.hasAttribute("inert")).toBe(false);
  const after = document.createElement("button");
  await act(async () => {
    document.body.append(after);
  });
  expect(after.hasAttribute("inert")).toBe(false);
});

it("gives only the top drawer Escape ownership and restores the underlying modal", () => {
  const trigger = fixture();
  const closeFirst = vi.fn(),
    closeSecond = vi.fn();
  const first = render(
    <Drawer title="First" onClose={closeFirst}>
      <button>First option</button>
    </Drawer>,
  );
  const firstDialog = screen.getByRole("dialog", { name: "First" });
  const firstOption = screen.getByRole("button", { name: "First option" });
  firstOption.focus();
  const second = render(
    <Drawer title="Second" onClose={closeSecond}>
      Second content
    </Drawer>,
  );
  const secondDialog = screen.getByRole("dialog", { name: "Second" });
  expect(firstDialog.closest("[inert]")).not.toBeNull();
  expect(secondDialog.closest("[inert]")).toBeNull();
  expect(secondDialog.getAttribute("aria-labelledby")).not.toBe(
    firstDialog.getAttribute("aria-labelledby"),
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closeSecond).toHaveBeenCalledTimes(1);
  expect(closeFirst).not.toHaveBeenCalled();
  second.unmount();
  expect(document.body.style.overflow).toBe("hidden");
  expect(firstDialog.closest("[inert]")).toBeNull();
  expect(document.activeElement).toBe(firstOption);
  expect(trigger.hasAttribute("inert")).toBe(true);
  first.unmount();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.getAttribute("style")).toBeNull();
});

it("does not steal focus or unlock when an underlying drawer unmounts first", () => {
  const trigger = fixture();
  const first = render(panel());
  screen.getByRole("button", { name: "Inside option" }).focus();
  const second = render(
    <Drawer title="Top" onClose={() => {}}>
      Top content
    </Drawer>,
  );
  const top = screen.getByRole("dialog", { name: "Top" });
  first.unmount();
  expect(document.activeElement).toBe(top);
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  second.unmount();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(document.body.getAttribute("style")).toBeNull();
});

it("uses preventScroll for initial and restored focus", () => {
  const trigger = fixture();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  const view = render(panel());
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  view.unmount();
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(trigger);
});
