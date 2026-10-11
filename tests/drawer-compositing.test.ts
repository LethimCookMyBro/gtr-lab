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
const sheet = () =>
  rules(".drawer").find((rule) => rule.parent?.type === "root");
const luminance = (hex: string) =>
  [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i],
      0,
    );

describe("drawer compositing surfaces", () => {
  it("gives the sheet an opaque charcoal backing independent of the scene", () => {
    expect(property(sheet(), "background")).toBe("#171b1e");
  });

  it("keeps the existing viewport backdrop without a second sheet blur", () => {
    const backdrop = rules(".drawer-backdrop").find((rule) =>
      property(rule, "backdrop-filter"),
    );
    expect(property(backdrop, "background")).toBe("#05080966");
    expect(property(backdrop, "backdrop-filter")).toBe("blur(4px)");
    expect(property(backdrop, "inset")).toBe("0");
    expect(property(backdrop, "width")).toBe("100%");
    expect(property(backdrop, "height")).toBe("100%");
    for (const rule of rules(".drawer")) {
      for (const name of ["backdrop-filter", "-webkit-backdrop-filter"]) {
        expect(["", "none"]).toContain(property(rule, name));
      }
    }
  });

  it("keeps ordinary sheet text readable against the opaque backing", () => {
    const background = property(sheet(), "background");
    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    for (const foreground of [
      property(rules(":root")[0], "color"),
      property(rules(":root")[0], "--muted"),
      property(rules(".panel-intro")[0], "color"),
      property(rules(".availability-note")[0], "color"),
    ]) {
      expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(
        (luminance(foreground) + 0.05) / (luminance(background) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
