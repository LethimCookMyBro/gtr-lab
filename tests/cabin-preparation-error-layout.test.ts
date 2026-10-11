import { readFileSync } from "node:fs";
import { parse, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const css = parse(
  readFileSync(
    new URL("../src/styles/cabin-preview.css", import.meta.url),
    "utf8",
  ),
);
const error = '.configurator[data-cabin-preparation="error"]';
function rule(selector: string, media?: string) {
  const matches: Rule[] = [];
  css.walkRules(selector, (candidate) => {
    if (
      media
        ? candidate.parent?.type === "atrule" &&
          candidate.parent.params === media
        : candidate.parent?.type === "root"
    )
      matches.push(candidate);
  });
  expect(matches, `${selector} at ${media ?? "base"}`).toHaveLength(1);
  return matches[0];
}
function property(candidate: Rule, name: string) {
  let value: string | undefined;
  candidate.walkDecls(name, (declaration) => {
    value = declaration.value;
  });
  return value;
}
const mobile = "(max-width: 760px)";

describe("cabin preparation failure source contract (browser geometry still requires CI)", () => {
  it("allocates separate content-sized desktop rows for error and scene controls", () => {
    const container = rule(error);
    expect(property(container, "display")).toBe("grid");
    expect(property(container, "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(property(container, "grid-template-rows")).toBe(
      "minmax(300px, 1fr) auto auto auto 156px",
    );
    expect(property(container, "min-height")).toBe("min-content");
    expect(
      property(rule(`${error} .cabin-preparation-error`), "grid-row"),
    ).toBe("2");
    expect(property(rule(`${error} .scene-bottom`), "grid-row")).toBe("3");
  });
  it("removes competing absolute offsets instead of concealing the overlap", () => {
    for (const child of [".cabin-preparation-error", ".scene-bottom"]) {
      const item = rule(`${error} ${child}`);
      expect(property(item, "position")).toBe("relative");
      expect(property(item, "inset")).toBe("auto");
    }
    expect(
      property(rule(`${error} .cabin-preparation-error`), "transform"),
    ).toBe("none");
    const forbidden: string[] = [];
    css.walkRules((candidate) => {
      if (candidate.selector.includes(error))
        candidate.walkDecls((declaration) => {
          if (
            declaration.prop.startsWith("overflow") &&
            /hidden|clip/.test(declaration.value)
          )
            forbidden.push(declaration.toString());
          if (declaration.prop === "z-index")
            forbidden.push(declaration.toString());
        });
    });
    expect(forbidden).toEqual([]);
  });
  it("puts error, navigation, toolbar and paint rail in distinct mobile flow rows", () => {
    expect(property(rule(error, mobile), "grid-template-rows")).toBe(
      "230px minmax(160px, 1fr) auto auto auto auto",
    );
    for (const [child, row] of [
      [".cabin-preparation-error", "3"],
      [".scene-bottom", "4"],
      [".config-toolbar", "5"],
      [".paint-rail", "6"],
    ]) {
      expect(property(rule(`${error} ${child}`, mobile), "grid-row")).toBe(row);
    }
    for (const child of [".config-toolbar", ".paint-rail"]) {
      const item = rule(`${error} ${child}`, mobile);
      expect(property(item, "position")).toBe("relative");
      expect(property(item, "inset")).toBe("auto");
    }
    expect(property(rule(`${error} .paint-rail`, mobile), "height")).toBe(
      "auto",
    );
    expect(property(rule(`${error} .paint-rail`, mobile), "min-height")).toBe(
      "155px",
    );
  });
  it("places error-only flow after the existing narrow rail overrides", () => {
    const narrow: Rule[] = [];
    css.walkRules(".configurator.has-window-view .paint-rail", (candidate) => {
      narrow.push(candidate);
    });
    expect(narrow).toHaveLength(1);
    expect(
      rule(`${error} .paint-rail`, mobile).source!.start!.offset,
    ).toBeGreaterThan(narrow[0].source!.start!.offset!);
    expect(property(rule(error, mobile), "min-height")).toBe("min-content");
    expect(property(rule(error, mobile), "height")).toBe("100svh");
  });
  it("retains readable wrapping and a complete 44px retry target", () => {
    expect(
      property(rule(`${error} .cabin-preparation-error`), "overflow-wrap"),
    ).toBe("anywhere");
    expect(
      property(
        rule(`${error} .cabin-preparation-error .text-link`),
        "min-height",
      ),
    ).toBe("44px");
    const hint = rule(`${error} .interaction-hint`);
    expect(property(hint, "position")).toBe("static");
    expect(property(hint, "white-space")).toBe("normal");
    expect(property(hint, "transform")).toBe("none");
    expect(property(rule(`${error} .scene-bottom`), "flex-wrap")).toBe("wrap");
  });
  it("gives the desktop toolbar its own flow row instead of intersecting scene controls", () => {
    const toolbar = rule(`${error} .config-toolbar`);
    expect(property(toolbar, "position")).toBe("relative");
    expect(property(toolbar, "inset")).toBe("auto");
    expect(property(toolbar, "grid-row")).toBe("4");
    expect(property(toolbar, "flex-direction")).toBe("row");
    expect(property(rule(`${error} .config-toolbar > button`), "flex")).toBe(
      "1",
    );
  });
  it("uses compact mobile spacing without reducing text or the visible-scene minimum", () => {
    const card = rule(`${error} .cabin-preparation-error`, mobile);
    expect(property(card, "padding")).toBe("12px");
    expect(property(card, "margin-top")).toBe("8px");
    expect(
      property(
        rule(`${error} .cabin-preparation-error .text-link`, mobile),
        "margin-top",
      ),
    ).toBe("8px");
    expect(property(rule(`${error} .scene-bottom`, mobile), "margin")).toBe(
      "8px 16px",
    );
    // Keep the unchanged capture contract's >150 CSS-pixel scene meaningful.
    expect(property(rule(error, mobile), "grid-template-rows")).toContain(
      "minmax(160px, 1fr)",
    );
    css.walkRules((candidate) => {
      if (candidate.selector.includes(error))
        expect(property(candidate, "font-size")).toBeUndefined();
    });
  });
  it("bounds the error scene to its own row even when recovery content grows the page", () => {
    const stage = rule(`${error} .scene-stage`);
    expect(property(stage, "position")).toBe("relative");
    expect(property(stage, "inset")).toBe("auto");
    expect(property(stage, "grid-row")).toBe("1");
    expect(property(stage, "min-height")).toBe("0");
    expect(property(stage, "min-width")).toBe("0");
    expect(property(rule(`${error} .scene-stage`, mobile), "grid-row")).toBe(
      "2",
    );
  });
  it("retains the compact desktop paint reservation on short displays", () => {
    expect(
      property(
        rule(error, "(max-height: 760px) and (min-width: 761px)"),
        "grid-template-rows",
      ),
    ).toBe("minmax(300px, 1fr) auto auto auto 130px");
  });
});
