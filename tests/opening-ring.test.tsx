// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { OpeningMark } from "../src/components/home/OpeningMark";

afterEach(cleanup);
const props = {
  pending: true,
  heroReady: false,
  reducedMotion: false,
  onContinue: vi.fn(),
  onRetry: vi.fn(),
};

it("surrounds the genuine logos with one decorative activity ring", () => {
  const { container } = render(<OpeningMark {...props} />);
  const emblem = container.querySelector(".home-opening-emblem");
  expect(emblem).not.toBeNull();
  expect(emblem?.getAttribute("data-active")).toBe("true");
  expect(emblem?.querySelector('[role="img"]')).toBe(
    screen.getByRole("img", { name: "Nissan GT-R" }),
  );
  const ring = emblem?.querySelector(".home-opening-ring");
  expect(ring?.getAttribute("aria-hidden")).toBe("true");
  expect(ring?.querySelector(".home-opening-ring-arc")).not.toBeNull();
  expect(container.querySelector(".home-opening-rule")).toBeNull();
});

it("labels only image preparation without model download progress", () => {
  render(<OpeningMark {...props} />);
  const gate = screen.getByRole("dialog");
  expect(within(gate).queryByRole("progressbar")).toBeNull();
  expect(within(gate).getByRole("status").textContent).toBe(
    "Preparing the opening",
  );
  expect(gate.textContent).not.toMatch(/3D|model|download/i);
});

it("stops decorative motion for errors, reduced motion, and actual completion", () => {
  const { container, rerender } = render(<OpeningMark {...props} />);
  const active = () =>
    container
      .querySelector(".home-opening-emblem")
      ?.getAttribute("data-active");
  expect(active()).toBe("true");
  rerender(<OpeningMark {...props} reducedMotion />);
  expect(active()).toBe("false");
  expect(container.querySelector(".gtr-brand-chrome-sweep")).toBeNull();
  rerender(<OpeningMark {...props} visualFailed />);
  expect(active()).toBe("false");
  expect(container.querySelector(".gtr-brand-chrome-sweep")).toBeNull();
  expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
  rerender(<OpeningMark {...props} pending={false} />);
  expect(active()).toBe("false");
  expect(container.querySelector(".gtr-brand-chrome-sweep")).toBeNull();
});

it("keeps ring rotation continuous and confines the stronger chrome pass to the opening", () => {
  const css = parse(readFileSync("src/styles/home-loading.css", "utf8"));
  const animations = new Map<string, string>();
  css.walkRules((rule) => {
    rule.walkDecls("animation", ({ value }) => {
      animations.set(rule.selector, value);
    });
  });
  expect(
    animations.get(
      '.home-opening-emblem[data-active="true"] .home-opening-ring-arc',
    ),
  ).toMatch(/home-opening-orbit \d+ms linear infinite/);
  expect(
    animations.get(
      '.home-opening-emblem[data-active="true"] .gtr-brand-chrome-sweep::after',
    ),
  ).toMatch(/home-opening-chrome-pass \d+ms linear infinite/);
  const keyframes: string[] = [];
  css.walkAtRules("keyframes", (rule) => {
    keyframes.push(rule.params);
  });
  expect(keyframes).toContain("home-opening-shadow-reveal");
  expect(keyframes).toContain("home-opening-chrome-pass");
  expect(css.toString()).toContain("clip-path: inset(50%)");
});
