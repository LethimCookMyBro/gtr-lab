// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";

const style = document.createElement("style");
afterEach(() => {
  style.remove();
  document.body.replaceChildren();
});

function heroStyles() {
  style.textContent = ["home.css", "home-opening-cards.css"]
    .map((file) => readFileSync(`src/styles/${file}`, "utf8"))
    .join("\n");
  document.head.append(style);
  // jsdom does not evaluate media queries. Flatten only the desktop rules so
  // this contract catches a return to copy anchored to the oversized film panel.
  const desktopRules = [...style.sheet!.cssRules].flatMap((rule) => {
    if (rule instanceof CSSMediaRule)
      return rule.conditionText === "(min-width: 768px)"
        ? [...rule.cssRules].map((child) => child.cssText)
        : [];
    return [rule.cssText];
  });
  style.textContent = desktopRules.join("\n");
  document.body.innerHTML =
    '<section class="home-hero-runway"><div class="home-hero-sticky"><div class="home-hero-copy"><h1>Engineered<br>to defy.</h1></div></div></section>';
  return {
    copy: getComputedStyle(document.querySelector(".home-hero-copy")!),
    title: getComputedStyle(document.querySelector("h1")!),
  };
}

it("anchors desktop copy to the visible viewport when the intact film is taller", () => {
  const { copy } = heroStyles();
  expect(copy.bottom).toContain("100svh");
  expect(copy.bottom).toContain("--hero-panel-height");
});

it("positions the desktop poster cue below the header's full interactive area", () => {
  style.textContent = ["home.css", "home-film-entry.css"]
    .map((file) => readFileSync(`src/styles/${file}`, "utf8"))
    .join("\n");
  document.head.append(style);
  document.body.innerHTML =
    '<header class="home-header"></header><div class="home-film-entry">Loading film…</div>';
  const header = getComputedStyle(document.querySelector(".home-header")!);
  const cue = getComputedStyle(document.querySelector(".home-film-entry")!);
  expect(parseFloat(cue.insetBlockStart)).toBeGreaterThanOrEqual(
    parseFloat(header.height) + 16,
  );
});
