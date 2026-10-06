// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("allows the scroll fade after loader focus while keeping focused actions readable", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/styles/home.css", "utf8");
  document.head.append(style);
  const hero = document.createElement("section");
  hero.dataset.copyInactive = "";
  hero.innerHTML =
    '<div class="home-hero-copy"><h1 tabindex="-1">Engineered to defy.</h1><div class="home-hero-support"><a href="/models">Explore the models</a></div></div>';
  document.body.append(hero);
  const heading = hero.querySelector("h1")!;
  const copy = hero.querySelector(".home-hero-copy")!;
  const support = hero.querySelector(".home-hero-support")!;
  try {
    heading.focus();
    expect(document.activeElement).toBe(heading);
    expect(getComputedStyle(copy).opacity).not.toBe("1");
    expect(getComputedStyle(support).pointerEvents).toBe("none");
    hero.querySelector("a")!.focus();
    // jsdom caches computed styles across focus changes. Re-read the same
    // production rules; the browser regression exercises native invalidation.
    style.textContent = style.textContent;
    expect(getComputedStyle(copy).opacity).toBe("1");
    expect(getComputedStyle(support).pointerEvents).toBe("auto");
  } finally {
    hero.remove();
    style.remove();
  }
});
it("keeps the noninteractive loading focus destination visually quiet without removing keyboard control outlines", () => {
  const style = document.createElement("style");
  // jsdom does not ship Chromium's UA focus ring for tabindex headings.
  // Supply that browser default before the production stylesheet.
  style.textContent =
    ":focus { outline-style: solid; outline-width: 2px; }\n" +
    readFileSync("src/styles/home-loading.css", "utf8");
  document.head.append(style);
  const heading = document.createElement("h1");
  heading.id = "home-title";
  heading.tabIndex = -1;
  document.body.append(heading);
  heading.focus();
  expect(document.activeElement).toBe(heading);
  try {
    expect(getComputedStyle(heading).outlineStyle).toBe("none");
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    expect(getComputedStyle(button).outlineStyle).toBe("solid");
    button.remove();
  } finally {
    heading.remove();
    style.remove();
  }
});
