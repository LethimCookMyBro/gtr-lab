// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeFooter } from "../src/components/layout/SiteLayout";

const style = document.createElement("style");

afterEach(() => {
  cleanup();
  style.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  const link = screen.getByRole("link", { name: "All models" });
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
  const link = screen.getByRole("link", { name: "All models" });
  link.focus();
  const arrow = getComputedStyle(link.querySelector("svg")!);
  expect(arrow.transform).toBe("none");
  expect(arrow.transition).toBe("none");
  expect(getComputedStyle(link).transition).toBe("none");
});

it("keeps only essential footer links without repeating the model invitations or introduction", () => {
  footer();
  const content = screen.getByRole("contentinfo");
  expect(
    within(content)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/", "/models", "/heritage", "/credits"]);
  expect(
    within(content).getByRole("link", { name: "GT-R LAB home" }),
  ).toBeTruthy();
  expect(within(content).getAllByRole("navigation")).toHaveLength(1);
  expect(
    within(content).queryByText(/engineering · culture · motion/i),
  ).toBeNull();
  expect(
    within(content).queryByText(/independent digital exhibition/i),
  ).toBeNull();
  expect(within(content).queryByText("Find your expression")).toBeNull();
  expect(within(content).queryByText("Road")).toBeNull();
  expect(within(content).queryByText("Beyond the road")).toBeNull();
});

it.each([
  [false, "smooth"],
  [true, "instant"],
] as const)(
  "returns to the top with reduced motion %s",
  (reducedMotion, behavior) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
      })),
    );
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    footer(reducedMotion);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior });
  },
);
