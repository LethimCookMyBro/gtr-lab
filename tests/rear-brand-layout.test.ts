import { readFileSync } from "node:fs";
import { parse } from "postcss";
import type { AtRule } from "postcss";
import { describe, expect, it } from "vitest";

const css = parse(
  ["home-opening-cards.css", "home-rear.css"]
    .map((name) => readFileSync(`src/styles/${name}`, "utf8"))
    .join("\n"),
);

function declarations(selector: string, width: number) {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    let parent = rule.parent;
    while (parent?.type === "atrule") {
      const at = parent as AtRule;
      if (at.name === "media") {
        const maximum = /max-width:\s*(\d+)px/.exec(at.params);
        if (!maximum || width > Number(maximum[1])) return;
      }
      parent = parent.parent;
    }
    rule.walkDecls((declaration) => {
      result[declaration.prop] = declaration.value;
    });
  });
  return result;
}

// Resolve the actual CSS sizing expressions, rather than duplicating the new
// layout constants. The browser companion verifies real boxes and vehicle pixels.
function length(value: string, width: number, height: number): number {
  const expression = /^(min|clamp)\((.*)\)$/.exec(value);
  if (expression) {
    const parts = expression[2]
      .split(",")
      .map((part) => length(part.trim(), width, height));
    return expression[1] === "min"
      ? Math.min(...parts)
      : Math.max(parts[0], Math.min(parts[1], parts[2]));
  }
  const dimension = /^([\d.]+)(px|svh|vh|vw|%)$/.exec(value);
  if (!dimension) throw new Error(`Unsupported CSS layout value: ${value}`);
  const number = Number(dimension[1]);
  return dimension[2] === "px"
    ? number
    : (number * (dimension[2] === "vw" ? width : height)) / 100;
}

describe("rear identity header budget", () => {
  it.each([
    [1920, 900],
    [1440, 900],
    [390, 844],
    [390, 600],
    [844, 390],
    [568, 320],
  ])(
    "keeps the complete original-ratio logo stack above the model band at %dx%d",
    (width, height) => {
      const header = declarations(".home-signature-identity", width);
      const eyebrow = declarations(".home-signature-identity > p", width);
      const mark = {
        ...declarations(".gtr-metal-wordmark", width),
        ...declarations(".home-signature-identity .gtr-metal-wordmark", width),
      };
      const pixel = (value: string) => length(value, width, height);
      const badgeWidth = pixel(mark["--gtr-badge-width"]);
      const nissanWidth = pixel(mark["--gtr-nissan-width"]);
      const bandBottom =
        pixel(header.top) +
        pixel(eyebrow["font-size"]) * Number(eyebrow["line-height"] ?? 1.6) +
        pixel(eyebrow["margin-bottom"]) +
        (nissanWidth * 727) / 850 +
        pixel(mark.gap) +
        (badgeWidth * 450) / 640;
      expect(
        bandBottom,
        "Header must end before the reserved vehicle region",
      ).toBeLessThanOrEqual(height * 0.28);
      expect(nissanWidth).toBeLessThan(badgeWidth * 0.35);
      expect(badgeWidth).toBeGreaterThanOrEqual(55);
    },
  );
});
