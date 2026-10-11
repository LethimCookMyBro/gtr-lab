import { readFileSync } from "node:fs";
import { parse, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = parse(
  readFileSync(new URL("../src/styles.css", import.meta.url), "utf8"),
);
const rules = (selector: string) => {
  const matches: Rule[] = [];
  stylesheet.walkRules((rule) => {
    if (rule.selectors.includes(selector)) matches.push(rule);
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

  it("keeps the exact viewport scrim without filtering its backdrop", () => {
    const backdrop = rules(".drawer-backdrop").find((rule) =>
      property(rule, "background"),
    );
    expect(property(backdrop, "background")).toBe("#05080966");
    expect(property(backdrop, "inset")).toBe("0");
    expect(property(backdrop, "width")).toBe("100%");
    expect(property(backdrop, "height")).toBe("100%");
    for (const rule of [...rules(".drawer"), ...rules(".drawer-backdrop")]) {
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

  it("preserves desktop, mobile, dismissal and reduced-motion choreography", () => {
    expect(property(sheet(), "animation")).toBe(
      "drawer-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)",
    );
    const inMedia = (selector: string, query: string) =>
      rules(selector).find(
        (rule) =>
          rule.parent?.type === "atrule" && rule.parent.params === query,
      );
    expect(
      property(inMedia(".drawer", "(max-width: 760px)"), "animation"),
    ).toBe("rise-in 0.25s");
    const enteringBackdrop = rules(".drawer-backdrop").find(
      (rule) => rule.parent?.type === "root" && property(rule, "animation"),
    );
    expect(property(enteringBackdrop, "animation")).toBe(
      "drawer-backdrop-in 300ms ease both",
    );
    expect(
      property(
        rules('.drawer-layer[data-phase="closing"] .drawer')[0],
        "animation",
      ),
    ).toBe("drawer-out 280ms cubic-bezier(0.4, 0, 0.7, 0.2) both");
    expect(
      property(
        rules('.drawer-layer[data-phase="closing"] .drawer-backdrop')[0],
        "animation",
      ),
    ).toBe("drawer-backdrop-out 280ms ease both");
    for (const selector of [".drawer", ".drawer-backdrop"]) {
      expect(
        property(
          inMedia(selector, "(prefers-reduced-motion: reduce)"),
          "animation",
        ),
      ).toBe("none");
    }
  });

  it("preserves large close and selection targets plus visible radio focus", () => {
    for (const name of ["min-width", "min-height"]) {
      expect(property(rules(".icon-button")[0], name)).toBe("44px");
    }
    expect(property(rules(".camera-choices button")[0], "min-height")).toBe(
      "67px",
    );
    expect(property(rules(".render-quality label")[0], "min-height")).toBe(
      "64px",
    );
    expect(
      property(rules(".render-quality label:focus-within")[0], "outline"),
    ).toBe("2px solid currentColor");
    expect(
      property(
        rules(".render-quality label:focus-within")[0],
        "outline-offset",
      ),
    ).toBe("3px");
  });
});
