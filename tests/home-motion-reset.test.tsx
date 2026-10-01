// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useHomeMotion } from "../src/components/home/useHomeMotion";
const onEra = () => {};
function Harness({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useHomeMotion(ref, reduced, onEra);
  return (
    <div ref={ref}>
      <section data-motion-section="hero" />
      <section data-motion-section="expanding" />
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("clears every scroll-derived value when reduced motion is enabled mid-story", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: -450,
    height: 1800,
    bottom: 1350,
    left: 0,
    right: 1440,
    width: 1440,
    x: 0,
    y: -450,
    toJSON: () => ({}),
  });
  const { container, rerender } = render(<Harness reduced={false} />);
  const hero = container.querySelector<HTMLElement>(
    '[data-motion-section="hero"]',
  )!;
  const expanding = container.querySelector<HTMLElement>(
    '[data-motion-section="expanding"]',
  )!;
  expect(hero.style.getPropertyValue("--copy-opacity")).not.toBe("");
  expect(expanding.style.getPropertyValue("--film-width")).not.toBe("");
  rerender(<Harness reduced />);
  for (const name of [
    "--progress",
    "--copy-opacity",
    "--film-width",
    "--film-height",
    "--film-radius",
    "--film-surround",
  ]) {
    expect(hero.style.getPropertyValue(name)).toBe("");
    expect(expanding.style.getPropertyValue(name)).toBe("");
  }
});
