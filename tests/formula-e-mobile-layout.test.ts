import { readFileSync } from "node:fs";
import { parse, type Rule } from "postcss";
import { describe, expect, it } from "vitest";
import { assessNeutralLayout } from "../scripts/formula-e-layout-contract.mjs";

const css = parse(readFileSync("src/styles/reference-unavailable.css", "utf8"));
const mobile = "(max-width: 700px)";
const card = ".model-band:has(.reference-unavailable)";
function rule(selector: string) {
  const found: Rule[] = [];
  css.walkRules(selector, (candidate) => {
    if (
      candidate.parent?.type === "atrule" &&
      candidate.parent.name === "media" &&
      candidate.parent.params === mobile
    )
      found.push(candidate);
  });
  expect(found, `${selector} at ${mobile}`).toHaveLength(1);
  return found[0];
}
function property(candidate: Rule, name: string) {
  let value: string | undefined;
  candidate.walkDecls(name, (declaration) => {
    value = declaration.value;
  });
  return value;
}

describe("Missing-reference mobile collection flow (actual pixel acceptance remains in CI)", () => {
  it("keeps rejecting the actual 320px season and heading collision", () => {
    expect(
      assessNeutralLayout({
        viewport: { x: 0, y: 0, width: 320, height: 844 },
        frame: { x: 0, y: 296.375, width: 320, height: 350 },
        labels: [{ x: 24, y: 500.125, width: 169, height: 18 }],
        obstacles: [{ x: 24, y: 501.0625, width: 198, height: 115.3125 }],
      }),
    ).toEqual(["Label 0 overlaps a control or heading"]);
  });
  it("reserves distinct content-sized media, copy and action rows", () => {
    expect(property(rule(card), "display")).toBe("grid");
    expect(property(rule(card), "grid-template-columns")).toBe(
      "minmax(0, 1fr)",
    );
    expect(property(rule(card), "grid-template-rows")).toBe("auto 1fr auto");
    expect(property(rule(card), "gap")).toBe("24px");
    expect(property(rule(card), "align-items")).toBe("start");
    expect(property(rule(card), "height")).toBeUndefined();
  });
  it("puts the unavailable-media layer into normal flow", () => {
    const media = rule(`${card} .band-image`);
    expect(property(media, "position")).toBe("static");
    expect(property(media, "inset")).toBe("auto");
    expect(property(media, "z-index")).toBe("auto");
  });
  it("sizes both labels from their content rather than absolute-media padding", () => {
    const labels = rule(`${card} .reference-unavailable`);
    expect(property(labels, "height")).toBe("auto");
    expect(property(labels, "min-height")).toBe("0");
    expect(property(labels, "padding")).toBe("0");
    expect(property(labels, "align-items")).toBe("flex-start");
    expect(property(labels, "text-align")).toBe("left");
    for (const propertyName of ["display", "font-size", "line-height"])
      expect(property(labels, propertyName)).toBeUndefined();
  });
  it("keeps Explore in its own trailing row rather than beside wrapping copy", () => {
    expect(property(rule(`${card} .band-action`), "justify-self")).toBe("end");
  });
  it("wins over later shared card CSS without modifying the first five cards", () => {
    // main.tsx imports shared styles after the component's stylesheet. These
    // two-class selectors outrank the shared one-class mobile declarations.
    const shared = parse(readFileSync("src/styles.css", "utf8"));
    const sharedCards: Rule[] = [];
    shared.walkRules(".model-band", (candidate) => {
      sharedCards.push(candidate);
    });
    expect(sharedCards.length).toBeGreaterThan(0);
    expect(property(rule(card), "align-items")).toBe("start");
    const correctedSelectors: string[] = [];
    css.walkRules((candidate) => {
      if (
        candidate.parent?.type !== "atrule" ||
        candidate.parent.params !== mobile
      )
        return;
      if (candidate.selector.includes("model-band"))
        correctedSelectors.push(candidate.selector);
    });
    expect(correctedSelectors).toEqual([
      card,
      `${card} .band-image`,
      `${card} .reference-unavailable`,
      `${card} .band-action`,
    ]);
  });
});

it("does not apply missing-media layout to the acquired Formula E photograph", () => {
  css.walkRules((candidate) => {
    expect(candidate.selector).not.toContain("model-band-formula-e");
  });
});
