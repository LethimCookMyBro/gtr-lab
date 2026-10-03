// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
import { EditorialOverlap } from "../src/components/home/EditorialOverlap";

const style = document.createElement("style");
afterEach(() => {
  cleanup();
  style.remove();
});
function story(mobile = false) {
  style.textContent = ["home.css", "home-heritage.css"]
    .map((file) => readFileSync(`src/styles/${file}`, "utf8"))
    .join("\n");
  document.head.append(style);
  if (mobile) {
    // jsdom does not evaluate responsive queries. Flatten the actual phone rules
    // in source order so higher-specificity legacy styles cannot escape this test.
    style.textContent = [...style.sheet!.cssRules]
      .map((rule) => {
        if (rule instanceof CSSMediaRule)
          return /\(max-width:\s*700px\)/.test(rule.conditionText) &&
            !rule.conditionText.includes("min-width")
            ? [...rule.cssRules].map((child) => child.cssText).join("\n")
            : "";
        return rule.cssText;
      })
      .join("\n");
  }
  return render(
    <MemoryRouter>
      <div className="cinematic-home" data-sequential-motion="false">
        <EditorialOverlap />
        <HeritageJourney
          activeEra={0}
          onEra={() => {}}
          sequentialMotion={false}
        />
      </div>
    </MemoryRouter>,
  );
}

it("uses the same opacity and translation channels for each independent editorial and archive item", () => {
  const { container } = story();
  const selectors = [
    ".home-editorial-copy",
    ".home-editorial-image",
    ".home-archive-inline-copy",
    ".home-archive-image",
    ".home-archive-support-image",
    ".home-archive-achievement",
  ];
  for (const selector of selectors) {
    const node = container.querySelector<HTMLElement>(selector)!;
    const styles = getComputedStyle(node);
    expect(styles.opacity, selector).toBe("var(--item-opacity, 1)");
    expect(styles.transform, selector).toBe(
      "translate3d(0, var(--item-shift, 0px), 0)",
    );
  }
  // A spread-wide transform would double the photo motion and separate its reading order.
  const spread = getComputedStyle(
    container.querySelector(".home-archive-spread")!,
  );
  expect(spread.opacity).not.toContain("--chapter");
  expect(spread.transform).not.toContain("--chapter");
});

it("uses condensed bold motorsport headings and neutral/red archive evidence", () => {
  const { container } = story();
  for (const node of container.querySelectorAll(
    ".home-editorial-copy h2, .home-archive-intro h2, .home-archive-inline-copy h3, .home-archive-achievement strong",
  )) {
    const styles = getComputedStyle(node);
    expect(styles.fontFamily).toBe("var(--font-display)");
    expect(styles.fontWeight).toBe("700");
  }
  const archive = getComputedStyle(container.querySelector("#home-heritage")!);
  expect(archive.backgroundColor).toBe("rgb(11, 13, 14)");
  const record = getComputedStyle(
    container.querySelector(".home-archive-achievement")!,
  );
  expect(record.borderLeftColor).toBe("rgb(200, 36, 53)");
  const stat = getComputedStyle(
    container.querySelector(".home-archive-achievement strong")!,
  );
  expect(stat.color).toBe("rgb(244, 244, 244)");
});

it("keeps the phone photograph on the same cue without a second crop, scale or overlap", () => {
  const { container } = story(true);
  const cockpit = container.querySelector<HTMLElement>(
    ".home-editorial-image--cockpit",
  )!;
  const frame = getComputedStyle(cockpit);
  expect(frame.transform).toBe("translate3d(0, var(--item-shift, 0px), 0)");
  expect(frame.clipPath).toBe("none");
  expect(frame.width).toBe("100%");
  expect(frame.marginTop).toBe("0px");
  expect(getComputedStyle(cockpit.querySelector("img")!).transform).toBe(
    "none",
  );
});
