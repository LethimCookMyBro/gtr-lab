// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useHomeMotion } from "../src/components/home/useHomeMotion";
import { expansionAt, timelineMotionAt } from "../src/components/home/motion";

const onEra = () => {};
function Story({ reduced = false }: { reduced?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useHomeMotion(root, reduced, onEra);
  return (
    <div ref={root}>
      <section data-motion-section="hero">
        <div className="home-hero-support">
          <a href="/models">Models</a>
        </div>
      </section>
      <section data-motion-section="expanding">
        <div />
      </section>
      <section data-motion-section="heritage">
        <div className="home-archive-stage" />
        <article className="home-archive-chapter">
          <div
            className="home-r32-stage"
            style={{ position: "sticky", top: 150 }}
          />
        </article>
      </section>
    </div>
  );
}

let top = 0;
let height = 2000;
let pending: FrameRequestCallback | undefined;
let schedule: ReturnType<typeof vi.fn>;
const flush = () =>
  act(() => {
    const callback = pending;
    pending = undefined;
    callback?.(0);
  });
const scroll = (nextTop: number) => {
  top = nextTop;
  act(() => window.dispatchEvent(new Event("scroll")));
  flush();
};

beforeEach(() => {
  top = 0;
  height = 2000;
  pending = undefined;
  vi.stubGlobal("innerHeight", 1000);
  schedule = vi.fn((callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", schedule);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 1440,
      width: 1440,
      x: 0,
      y: top,
      toJSON() {},
    }),
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("home-archive-stage") ? 60 : 1000;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains exact reversible film bounds without writing the overridden height channel", () => {
  const { container } = render(<Story />);
  const film = container.querySelector<HTMLElement>(
    '[data-motion-section="expanding"]',
  )!;
  for (const progress of [0, 0.25, 0.5, 1, 0.5, 0.25, 0]) {
    scroll(-1000 * progress);
    const bounds = expansionAt(progress);
    expect(film.style.getPropertyValue("--film-width")).toBe(
      `${bounds.width}%`,
    );
    expect(film.style.getPropertyValue("--film-radius")).toBe(
      `${bounds.radius}px`,
    );
    expect(film.style.getPropertyValue("--film-surround")).toBe(
      `rgb(${bounds.shade} ${bounds.shade} ${bounds.shade})`,
    );
    expect(film.style.getPropertyValue("--film-height")).toBe("");
  }
});

it("retains reversible heritage opacity and scale without animating large-image blur", () => {
  const { container } = render(<Story />);
  const chapter = container.querySelector<HTMLElement>(
    ".home-archive-chapter",
  )!;
  for (const nextTop of [1500, 200, 0, -1000, 0, 200, 1500]) {
    scroll(nextTop);
    const score = timelineMotionAt((nextTop + 350 - 480) / 1000);
    expect(chapter.style.getPropertyValue("--timeline-opacity")).toBe(
      score.opacity.toFixed(5),
    );
    expect(chapter.style.getPropertyValue("--timeline-scale")).toBe(
      score.scale.toFixed(5),
    );
    expect(chapter.style.getPropertyValue("--timeline-blur")).toBe("");
  }
});

it("reuses stable DOM references across scroll updates while re-reading changing geometry", () => {
  const { container } = render(<Story />);
  const film = container.querySelector<HTMLElement>(
    '[data-motion-section="expanding"]',
  )!;
  const chapter = container.querySelector<HTMLElement>(
    ".home-archive-chapter",
  )!;
  const stage = container.querySelector<HTMLElement>(".home-r32-stage")!;
  const query = vi.spyOn(Element.prototype, "querySelector");
  const queryAll = vi.spyOn(Element.prototype, "querySelectorAll");
  scroll(-500);
  expect(film.style.getPropertyValue("--film-width")).toBe("90%");
  const priorProgress = chapter.style.getPropertyValue("--r32-progress");
  // Resize/font/image reflow can change height and sticky offset between frames.
  // Keep these measurements live; this change does not cache layout metrics.
  height = 3000;
  stage.style.top = "200px";
  act(() => window.dispatchEvent(new Event("resize")));
  flush();
  expect(film.style.getPropertyValue("--film-width")).toBe("85%");
  expect(chapter.style.getPropertyValue("--r32-progress")).not.toBe(
    priorProgress,
  );
  expect(query).not.toHaveBeenCalled();
  expect(queryAll).not.toHaveBeenCalled();
});

it("coalesces scroll notifications and does not schedule an idle animation loop", () => {
  const { unmount } = render(<Story />);
  expect(schedule).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });
  expect(schedule).toHaveBeenCalledTimes(1);
  flush();
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(pending).toBeUndefined();
  act(() => window.dispatchEvent(new Event("scroll")));
  expect(schedule).toHaveBeenCalledTimes(2);
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  act(() => window.dispatchEvent(new Event("scroll")));
  expect(schedule).toHaveBeenCalledTimes(2);
});

it("clears motion when reduced motion changes and restores the same scroll state when re-enabled", () => {
  top = -500;
  const { container, rerender } = render(<Story />);
  const film = container.querySelector<HTMLElement>(
    '[data-motion-section="expanding"]',
  )!;
  const chapter = container.querySelector<HTMLElement>(
    ".home-archive-chapter",
  )!;
  const width = film.style.getPropertyValue("--film-width");
  const opacity = chapter.style.getPropertyValue("--timeline-opacity");
  rerender(<Story reduced />);
  expect(film.style.getPropertyValue("--film-width")).toBe("");
  expect(chapter.style.getPropertyValue("--timeline-opacity")).toBe("");
  scroll(-500);
  expect(film.style.getPropertyValue("--film-width")).toBe("");
  rerender(<Story />);
  expect(film.style.getPropertyValue("--film-width")).toBe(width);
  expect(chapter.style.getPropertyValue("--timeline-opacity")).toBe(opacity);
});
