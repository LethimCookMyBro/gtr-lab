// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import { parse } from "postcss";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GtrWordmark } from "../src/components/home/GtrWordmark";
import { CreditsPage } from "../src/pages/CreditsPage";

const file = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(file(path));
const hash = (path: string) =>
  createHash("sha256").update(read(path)).digest("hex");
afterEach(cleanup);

describe("authentic GT-R identity", () => {
  it("uses two intact image assets instead of a typographic imitation", () => {
    const { container } = render(<GtrWordmark sweep className="sample" />);
    const mark = screen.getByRole("img", { name: "Nissan GT-R" });
    const images = [...mark.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/brand/nissan-2001.svg",
      "/brand/gtr-stacked-badge.png",
    ]);
    expect(images.map((image) => image.getAttribute("alt"))).toEqual(["", ""]);
    expect(
      images.every((image) => image.getAttribute("draggable") === "false"),
    ).toBe(true);
    expect(container.querySelector(".gtr-metal-letters")).toBeNull();
    expect(mark.classList.contains("sample")).toBe(true);
    expect(mark.getAttribute("data-sweep")).toBe("true");
  });

  it("preserves the original supplied badge and verified Nissan source bytes", () => {
    expect(existsSync(file("../public/brand/gtr-stacked-badge.png"))).toBe(
      true,
    );
    expect(hash("../public/brand/gtr-stacked-badge.png")).toBe(
      "4ecdb6388cce428b58fada1740eb4b7da7da69b41fc7cb00bb34158b159de27c",
    );
    expect(hash("../public/brand/nissan-2001.svg")).toBe(
      "3c3ffd65657551f8e61c6c96976bdcdcea04c5d688a00e7f2e78f1c1715b1c33",
    );
  });

  it("ships unmodified OFL display type and keeps body text readable", () => {
    const css = read("../src/styles.css").toString();
    expect(
      hash("../public/fonts/barlow-condensed/BarlowCondensed-Bold.ttf"),
    ).toBe("e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65");
    expect(
      read("../public/fonts/barlow-condensed/OFL.txt").toString(),
    ).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(css).toContain('font-family: "Barlow Condensed"');
    expect(css).toContain(
      'url("/fonts/barlow-condensed/BarlowCondensed-Bold.ttf")',
    );
    expect(css).toMatch(/:root\s*\{[^}]*font-family:\s*"DM Sans Variable"/);
  });

  it("discloses logo provenance, trademark ownership and font licensing", () => {
    render(<CreditsPage />);
    expect(
      screen.getByRole("heading", { name: "Brand marks & typography" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nissan and GT-R names and logos are trademarks/),
    ).toBeTruthy();
    expect(
      screen.getByText(/copyright permission has not been verified/i),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Barlow Condensed · SIL Open Font License" })
        .getAttribute("href"),
    ).toBe("/fonts/barlow-condensed/OFL.txt");
  });
});

describe("one-shot authentic loader emblem", () => {
  it("adds a decorative chrome light pass only when the loading intro is active", () => {
    const { container, rerender } = render(<GtrWordmark sweep />);
    const light = container.querySelector(".gtr-brand-chrome-sweep");
    expect(light).not.toBeNull();
    expect(light?.getAttribute("aria-hidden")).toBe("true");
    rerender(<GtrWordmark />);
    expect(container.querySelector(".gtr-brand-chrome-sweep")).toBeNull();
  });

  it("runs one chrome sweep and red reveal, with static original imagery for reduced motion", () => {
    const css = parse(read("../src/styles/home-opening-cards.css").toString());
    const animations: string[] = [];
    let reducedMotionDisablesSweep = false;
    css.walkRules((rule) => {
      if (rule.selector.includes('[data-sweep="true"]')) {
        rule.walkDecls("animation", ({ value }) => {
          animations.push(value);
        });
      }
      if (
        rule.selector.includes(".gtr-brand-chrome-sweep") &&
        rule.parent?.type === "atrule" &&
        rule.parent.name === "media" &&
        rule.parent.params.includes("prefers-reduced-motion: reduce")
      ) {
        rule.walkDecls("display", ({ value }) => {
          if (value === "none") reducedMotionDisablesSweep = true;
        });
      }
    });
    expect(
      animations.some((value) => value.includes("gtr-chrome-light-pass")),
    ).toBe(true);
    expect(animations.some((value) => value.includes("gtr-red-reveal"))).toBe(
      true,
    );
    expect(animations.every((value) => !value.includes("infinite"))).toBe(true);
    expect(reducedMotionDisablesSweep).toBe(true);
  });
});
