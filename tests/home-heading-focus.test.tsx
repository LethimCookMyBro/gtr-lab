// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
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
