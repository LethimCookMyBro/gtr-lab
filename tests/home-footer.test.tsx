// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeFooter } from "../src/components/layout/SiteLayout";

const style = document.createElement("style");

afterEach(() => {
  cleanup();
  style.remove();
});

function footer(reducedMotion = false) {
  style.textContent = readFileSync("src/styles/home.css", "utf8");
  document.head.append(style);
  function normalize(rule: CSSRule): string {
    // jsdom does not apply media queries. Preserve cascade order while enabling
    // only the real reduced-motion rules for this preference contract.
    if (rule instanceof CSSMediaRule)
      return reducedMotion &&
        rule.conditionText === "(prefers-reduced-motion: reduce)"
        ? [...rule.cssRules].map(normalize).join("\n")
        : "";
    // jsdom miscomputes specificity for selector groups containing pseudo-elements.
    // Separate these equivalent rules; Chromium checks the original CSS in e2e.
    if (
      rule instanceof CSSStyleRule &&
      rule.selectorText.includes(".home-footer-link")
    )
      return rule.selectorText
        .split(",")
        .map((selector) => `${selector} { ${rule.style.cssText} }`)
        .join("\n");
    return rule.cssText;
  }
  style.textContent = [...style.sheet!.cssRules].map(normalize).join("\n");
  return render(
    <MemoryRouter>
      <HomeFooter />
    </MemoryRouter>,
  );
}

it("gives every footer destination a full-width row and decorative directional arrow", () => {
  footer();
  const destinations = [
    ["Find your expression", "/models"],
    ["Premium", "/configurator/premium"],
    ["NISMO", "/configurator/nismo"],
    ["T-spec", "/configurator/tspec"],
    ["GT-R50", "/configurator/gtr50"],
    ["GT3", "/configurator/gt3"],
    ["GT500", "/configurator/gt500"],
    ["All models", "/models"],
    ["Heritage", "/heritage"],
    ["Credits & sources", "/credits"],
  ];

  for (const [name, href] of destinations) {
    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("href"), name).toBe(href);
    expect(link.querySelector("svg")?.getAttribute("aria-hidden"), name).toBe(
      "true",
    );
    const computed = getComputedStyle(link);
    expect(computed.display, name).toBe("flex");
    expect(computed.width, name).toBe("100%");
    expect(Number.parseFloat(computed.minHeight), name).toBeGreaterThanOrEqual(
      44,
    );
  }

  expect(
    within(screen.getByRole("contentinfo")).getByText(
      "Independent fan project. Not affiliated with or endorsed by Nissan, NISMO or Italdesign.",
    ),
  ).toBeTruthy();
});

it("moves the arrow on keyboard focus while keeping the footer row stationary", () => {
  footer();
  const link = screen.getByRole("link", { name: "Find your expression" });
  const resting = getComputedStyle(link).transform;
  link.focus();
  expect(link.matches(":focus-visible")).toBe(true);
  // jsdom retains styles read by getByRole across focus changes; invalidate that
  // cache without altering any declarations before reading the focused state.
  style.textContent = style.textContent;
  expect(getComputedStyle(link.querySelector("svg")!).transform).toBe(
    "translate(3px, -3px)",
  );
  expect(getComputedStyle(link).transform).toBe(resting);
});

it("keeps reduced-motion keyboard feedback free of arrow movement or transitions", () => {
  footer(true);
  const link = screen.getByRole("link", { name: "Find your expression" });
  link.focus();
  const arrow = getComputedStyle(link.querySelector("svg")!);
  expect(arrow.transform).toBe("none");
  expect(arrow.transition).toBe("none");
  expect(getComputedStyle(link).transition).toBe("none");
});
