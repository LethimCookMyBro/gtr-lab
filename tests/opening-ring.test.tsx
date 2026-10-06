// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { OpeningMark } from "../src/components/home/OpeningMark";

afterEach(cleanup);
const props = {
  pending: true,
  scene: {
    phase: "downloading",
    loadedBytes: 1048576,
    totalBytes: 8388608,
  } as const,
  heroReady: true,
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

it("keeps measured download progress accessible without displaying byte numbers or a bar", () => {
  const { container } = render(<OpeningMark {...props} />);
  const gate = screen.getByRole("dialog");
  const progress = within(gate).getByRole("progressbar", {
    name: "R35 model download",
  });
  expect(progress.getAttribute("value")).toBe("1048576");
  expect(progress.getAttribute("max")).toBe("8388608");
  expect(progress.getAttribute("aria-valuetext")).toBe(
    "1.0 MB of 8.4 MB downloaded",
  );
  expect(progress.classList.contains("home-loading-assistive")).toBe(true);
  expect(gate.textContent).not.toMatch(/\d[\d.]* MB/);
  expect(container.querySelector(".home-loading-download")).toBeNull();
  expect(within(gate).getByRole("status").textContent).toBe(
    "Downloading the R35 model",
  );
});

it("does not invent a percentage when the response has no content length", () => {
  render(
    <OpeningMark
      {...props}
      scene={{ phase: "downloading", loadedBytes: 1048576 }}
    />,
  );
  const progress = screen.getByRole("progressbar");
  expect(progress.hasAttribute("value")).toBe(false);
  expect(progress.hasAttribute("aria-valuenow")).toBe(false);
  expect(progress.hasAttribute("aria-valuemax")).toBe(false);
  expect(progress.getAttribute("aria-valuetext")).toBe("1.0 MB received");
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
  rerender(
    <OpeningMark
      {...props}
      scene={{ phase: "error", message: "Download failed", recovery: "retry" }}
    />,
  );
  expect(active()).toBe("false");
  expect(container.querySelector(".gtr-brand-chrome-sweep")).toBeNull();
  expect(screen.getByRole("button", { name: "Retry 3D view" })).toBeTruthy();
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
