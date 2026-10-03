// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, render, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useHomeMotion } from "../src/components/home/useHomeMotion";
const onEra = () => {};
function Harness({
  reduced,
  onEraChange = onEra,
}: {
  reduced: boolean;
  onEraChange?: (era: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useHomeMotion(ref, reduced, onEraChange);
  return (
    <div ref={ref}>
      <section data-motion-section="hero">
        <div className="home-hero-copy">
          <div className="home-hero-support">
            <a href="/models">Explore the models</a>
          </div>
        </div>
      </section>
      <section data-motion-section="expanding" />
      <section data-motion-section="editorial">
        <figure data-motion-anchor="detail" />
        <figure data-motion-anchor="cockpit" />
      </section>
      <section data-motion-section="heritage">
        <div className="home-archive-stage" />
        <article className="home-archive-chapter" data-era-image="0" />
        <article className="home-archive-chapter" data-era-image="1" />
        <article className="home-archive-chapter" data-era-image="2" />
        <article className="home-archive-chapter" data-era-image="3" />
      </section>
      <section data-motion-section="signature">
        <div />
      </section>
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.scrollPaddingTop = "";
});

it("reads untransformed editorial geometry before writing any scroll styles", () => {
  vi.stubGlobal("innerWidth", 390);
  const order: string[] = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => {
      order.push("read-section");
      return {
        top: -450,
        height: 1800,
        bottom: 1350,
        left: 0,
        right: 390,
        width: 390,
        x: 0,
        y: -450,
        toJSON: () => ({}),
      };
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      order.push("read-anchor");
      return this.dataset.motionAnchor === "detail" ? 400 : 700;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    () => {
      order.push("read-height");
      return 300;
    },
  );
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(
    function (this: CSSStyleDeclaration, name, value, priority) {
      order.push("write");
      setProperty.call(this, name, value, priority);
    },
  );
  const { container, rerender } = render(<Harness reduced={false} />);
  expect(
    Number(
      container
        .querySelector<HTMLElement>('[data-motion-section="hero"]')!
        .style.getPropertyValue("--progress"),
    ),
  ).toBeCloseTo(0.3);
  const detail = container.querySelector<HTMLElement>(
    '[data-motion-anchor="detail"]',
  )!;
  const cockpit = container.querySelector<HTMLElement>(
    '[data-motion-anchor="cockpit"]',
  )!;
  expect(
    Number(detail.style.getPropertyValue("--item-progress")),
  ).toBeGreaterThan(Number(cockpit.style.getPropertyValue("--item-progress")));
  expect(order.lastIndexOf("read-anchor")).toBeLessThan(order.indexOf("write"));
  expect(order.lastIndexOf("read-section")).toBeLessThan(
    order.indexOf("write"),
  );
  const chapter = container.querySelector<HTMLElement>(
    ".home-archive-chapter",
  )!;
  expect(chapter.style.getPropertyValue("--chapter-progress")).not.toBe("");
  expect(Number(chapter.style.getPropertyValue("--chapter-reveal"))).toBe(1);
  rerender(<Harness reduced />);
  expect(chapter.style.getPropertyValue("--chapter-progress")).toBe("");
  expect(chapter.style.getPropertyValue("--chapter-reveal")).toBe("");
  expect(detail.style.getPropertyValue("--item-progress")).toBe("");
  expect(detail.style.getPropertyValue("--item-reveal")).toBe("");
  expect(
    container
      .querySelector<HTMLElement>('[data-motion-section="signature"]')!
      .style.getPropertyValue("--progress"),
  ).toBe("");
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

it("takes the fully faded hero link out of tab order and restores it in sequential mode", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: -1600,
    height: 1800,
    bottom: 200,
    left: 0,
    right: 1440,
    width: 1440,
    x: 0,
    y: -1600,
    toJSON: () => ({}),
  });
  const { container, rerender } = render(<Harness reduced={false} />);
  const hero = container.querySelector<HTMLElement>(
    '[data-motion-section="hero"]',
  )!;
  const link = container.querySelector("a")!;
  expect(link.tabIndex).toBe(-1);
  expect(hero.hasAttribute("data-copy-inactive")).toBe(true);
  rerender(<Harness reduced />);
  expect(link.tabIndex).toBe(0);
  expect(hero.hasAttribute("data-copy-inactive")).toBe(false);
});

it("keeps the slim era rail synchronized with native scrolling under reduced motion", () => {
  vi.stubGlobal("innerHeight", 390);
  document.documentElement.style.scrollPaddingTop = "100px";
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("home-archive-stage") ? 66 : 800;
    },
  );
  let selected = 0;
  let scheduled: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    scheduled = callback;
    return 1;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top =
        this.dataset.eraImage === undefined
          ? 0
          : (Number(this.dataset.eraImage) - selected) * 800 + 180;
      return {
        top,
        bottom: top + 800,
        height: 800,
        left: 0,
        right: 390,
        width: 390,
        x: 0,
        y: top,
        toJSON() {},
      };
    },
  );
  const changed = vi.fn();
  const { container } = render(<Harness reduced onEraChange={changed} />);
  expect(changed).toHaveBeenLastCalledWith(0);
  for (selected of [1, 2, 3, 2, 0]) {
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      scheduled?.(0);
    });
    expect(changed).toHaveBeenLastCalledWith(selected);
  }
  for (const chapter of container.querySelectorAll<HTMLElement>(
    ".home-archive-chapter",
  )) {
    expect(chapter.style.getPropertyValue("--chapter-reveal")).toBe("");
    expect(chapter.style.getPropertyValue("--chapter-progress")).toBe("");
  }
});
