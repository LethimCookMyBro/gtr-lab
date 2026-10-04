import { readFileSync } from "node:fs";
import { parse, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = parse(
  readFileSync(new URL("../src/styles.css", import.meta.url), "utf8"),
);
const rules = (selector: string) => {
  const matches: Rule[] = [];
  stylesheet.walkRules(selector, (rule) => {
    matches.push(rule);
  });
  return matches;
};
const property = (rule: Rule | undefined, name: string) => {
  let value = "";
  rule?.walkDecls(name, (declaration) => {
    value = declaration.value;
  });
  return value;
};
const rgb = (hex: string) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
const luminance = (channels: number[]) =>
  channels
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i],
      0,
    );

describe("mobile configurator title backing", () => {
  it("keeps every title label readable over a white HDRI sky", () => {
    const scrim = rules(".config-title::before")[0];
    const gradient = property(scrim, "background");
    const colors = gradient.match(/#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/gi) ?? [];
    // The last nontransparent gradient stop backs the bottom of the title.
    const weakestBacking =
      (colors.length === 1 ? colors[0] : colors.at(-2)) ?? "#ffffff00";
    const alpha =
      weakestBacking.length === 9
        ? parseInt(weakestBacking.slice(7), 16) / 255
        : 1;
    const overWhite = rgb(weakestBacking).map(
      (channel) => channel * alpha + 1 - alpha,
    );
    const backgrounds = luminance(overWhite);
    const labelColors = [
      property(rules(":root")[0], "color"),
      property(rules(".config-title p")[0], "color"),
      property(rules(".study-disclosure")[0], "color"),
    ];
    for (const text of labelColors) {
      const foreground = luminance(rgb(text));
      const contrast =
        (Math.max(foreground, backgrounds) + 0.05) /
        (Math.min(foreground, backgrounds) + 0.05);
      expect(
        contrast,
        `${text} over the brightest scene`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("backs only the title rather than erasing the full-width room", () => {
    const scrims = rules(".config-title::before");
    expect(scrims).toHaveLength(1);
    const scrim = scrims[0];
    expect(scrim.parent).toMatchObject({
      name: "media",
      params: "(max-width: 760px)",
    });
    expect(property(scrim, "pointer-events")).toBe("none");
    expect(Number(property(scrim, "z-index"))).toBeLessThan(0);
    const [top, horizontal, bottom] = property(scrim, "inset")
      .split(/\s+/)
      .map(parseFloat);
    expect([top, horizontal, bottom]).toEqual([-44, -64, -44]);
    expect(property(scrim, "background")).toMatch(
      /radial-gradient\(\s*ellipse closest-side,/,
    );
    expect(property(scrim, "background")).toMatch(/#[0-9a-f]{6}00\s+100%/i);
    expect(property(scrim, "border-radius")).toBe("");
    const title = rules(".config-title").find(
      (rule) => rule.parent === scrim.parent,
    );
    expect(property(title, "width")).toBe("max-content");
    expect(property(title, "right")).toBe("auto");
    // The backing tracks text width rather than spanning the viewport.
    expect(parseFloat(property(title, "max-width"))).toBeLessThanOrEqual(260);
  });
});

describe("bright gallery interface", () => {
  it("uses a dark desktop label palette with contrast against pale architecture", () => {
    for (const selector of [
      ".environment-gallery.is-scene-ready .config-title",
      ".environment-gallery.is-scene-ready .config-title p",
      ".environment-gallery.is-scene-ready .study-disclosure",
      ".environment-gallery.is-scene-ready .scene-count",
    ]) {
      const rule = rules(selector)[0];
      expect(rule?.parent).toMatchObject({
        name: "media",
        params: "(min-width: 761px)",
      });
      const text = property(rule, "color");
      expect(text).toMatch(/^#[0-9a-f]{6}$/i);
      expect(
        (luminance(rgb("#b2b9bc")) + 0.05) / (luminance(rgb(text)) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
