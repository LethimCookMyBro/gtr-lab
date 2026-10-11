// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readTimelineFocus } from "../e2e/helpers/timeline-focus";

let chapter: HTMLElement;
let image: HTMLElement;
beforeEach(() => {
  chapter = document.createElement("article");
  chapter.style.setProperty("--timeline-opacity", "0.72");
  chapter.style.setProperty("--timeline-scale", "0.98");
  image = document.createElement("figure");
  image.className = "home-timeline-image";
  image.style.opacity = "0.72";
  image.style.filter = "none";
  chapter.append(image);
  document.body.append(chapter);
  vi.stubGlobal("scrollY", 500);
});
afterEach(() => {
  chapter.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function missingComputedMeasurement(property: "filter" | "opacity") {
  // Removing a declaration yields its valid CSS initial value (none/1).
  // Simulate a missing CSSOM measurement instead of confusing it with that default.
  const computed = getComputedStyle(image);
  Object.defineProperty(computed, property, { value: "" });
  const readStyle = globalThis.getComputedStyle;
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element) =>
    element === image ? computed : readStyle(element),
  );
}

it("reads finite opacity/scale and computed filter without the removed blur variable", () => {
  expect(chapter.style.getPropertyValue("--timeline-blur")).toBe("");
  expect(readTimelineFocus(chapter)).toEqual({
    scrollY: 500,
    opacity: 0.72,
    scale: 0.98,
    renderedOpacity: 0.72,
    renderedFilter: "none",
  });
});

it("remains self-contained when serialized as a Playwright evaluate callback", () => {
  const serialized = new Function(
    `return (${readTimelineFocus.toString()})`,
  )() as typeof readTimelineFocus;
  expect(serialized(chapter)).toEqual(readTimelineFocus(chapter));
});

it.each(["--timeline-opacity", "--timeline-scale"])(
  "rejects missing %s instead of silently treating it as zero",
  (property) => {
    chapter.style.removeProperty(property);
    expect(() => readTimelineFocus(chapter)).toThrow(/missing or nonfinite/i);
  },
);

it.each([" ", "NaN", "Infinity", "-Infinity", "0.98junk"])(
  "rejects a non-numeric timeline value %j",
  (value) => {
    chapter.style.setProperty("--timeline-scale", value);
    expect(() => readTimelineFocus(chapter)).toThrow(/missing or nonfinite/i);
  },
);

it("accepts a real zero without using a missing-value fallback", () => {
  chapter.style.setProperty("--timeline-opacity", "0");
  image.style.opacity = "0";
  const focus = readTimelineFocus(chapter);
  expect(focus.opacity).toBe(0);
  expect(focus.renderedOpacity).toBe(0);
});

it.each(["blur(0px)", "blur(3px)", "brightness(1)"])(
  "rejects a non-none computed filter %j",
  (value) => {
    image.style.filter = value;
    expect(() => readTimelineFocus(chapter)).toThrow(/filter must be none/i);
  },
);

it("rejects a missing computed filter measurement", () => {
  missingComputedMeasurement("filter");
  expect(() => readTimelineFocus(chapter)).toThrow(/filter must be none/i);
});

it("rejects a missing rendered opacity measurement", () => {
  missingComputedMeasurement("opacity");
  expect(() => readTimelineFocus(chapter)).toThrow(/missing or nonfinite/i);
});

it("rejects a nonfinite native scroll measurement", () => {
  vi.stubGlobal("scrollY", NaN);
  expect(() => readTimelineFocus(chapter)).toThrow(/missing or nonfinite/i);
});

it("rejects a missing timeline image with a useful diagnostic", () => {
  image.remove();
  expect(() => readTimelineFocus(chapter)).toThrow(/missing timeline image/i);
});
