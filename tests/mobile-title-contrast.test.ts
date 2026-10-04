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

describe("mobile configurator information header", () => {
  const header = () =>
    rules(".config-information-header").find(
      (rule) => rule.parent?.type === "atrule",
    );
  it("puts readable labels on one opaque header, without a scene scrim", () => {
    expect(rules(".config-title::before")).toHaveLength(0);
    const backing = property(header(), "background");
    expect(backing).toMatch(/^#[0-9a-f]{6}$/i);
    const background = luminance(rgb(backing));
    for (const foreground of [
      property(rules(":root")[0], "color"),
      property(rules(".config-title p")[0], "color"),
      property(rules(".study-disclosure")[0], "color"),
    ]) {
      expect(
        (luminance(rgb(foreground)) + 0.05) / (background + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("uses normal header flow and reserves a separate mobile canvas row", () => {
    const h = header();
    expect(h?.parent).toMatchObject({
      name: "media",
      params: "(max-width: 760px)",
    });
    expect(property(h, "display")).toBe("flex");
    expect(property(h, "position")).toBe("relative");
    expect(property(h, "grid-row")).toBe("1");
    const inMedia = (selector: string) =>
      rules(selector).find((rule) => rule.parent === h?.parent);
    expect(property(inMedia(".configurator"), "grid-template-rows")).toBe(
      "210px minmax(0, 1fr) 242px",
    );
    expect(property(inMedia(".config-header"), "position")).toBe("static");
    expect(property(inMedia(".config-title"), "position")).toBe("static");
    expect(property(inMedia(".scene-stage"), "grid-row")).toBe("2");
    expect(property(inMedia(".scene-stage"), "position")).toBe("relative");
    expect(property(inMedia(".scene-stage"), "inset")).toBe("auto");
    expect(844 - 210 - 242).toBeGreaterThanOrEqual(390);
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
