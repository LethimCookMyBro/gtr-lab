import { readFileSync } from "node:fs";
import { parse } from "postcss";
import type { AtRule } from "postcss";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";

const css = parse(
  ["home-opening-cards.css", "home-rear.css"]
    .map((name) => readFileSync(`src/styles/${name}`, "utf8"))
    .join("\n"),
);

function declarations(selector: string, width: number, height = Infinity) {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    let parent = rule.parent;
    while (parent?.type === "atrule") {
      const at = parent as AtRule;
      if (at.name === "media") {
        const maximum = /max-width:\s*(\d+)px/.exec(at.params);
        if (!maximum || width > Number(maximum[1])) return;
        const maximumHeight = /max-height:\s*(\d+)px/.exec(at.params);
        if (maximumHeight && height > Number(maximumHeight[1])) return;
        if (at.params.includes("orientation: portrait") && width >= height)
          return;
      }
      parent = parent.parent;
    }
    rule.walkDecls((declaration) => {
      result[declaration.prop] = declaration.value;
    });
  });
  return result;
}

// Resolve the actual CSS sizing expressions, rather than duplicating the new
// layout constants. The browser companion verifies real boxes and vehicle pixels.
function length(value: string, width: number, height: number): number {
  const expression = /^(min|clamp)\((.*)\)$/.exec(value);
  if (expression) {
    const parts = expression[2]
      .split(",")
      .map((part) => length(part.trim(), width, height));
    return expression[1] === "min"
      ? Math.min(...parts)
      : Math.max(parts[0], Math.min(parts[1], parts[2]));
  }
  const dimension = /^([\d.]+)(px|svh|vh|vw|%)$/.exec(value);
  if (!dimension) throw new Error(`Unsupported CSS layout value: ${value}`);
  const number = Number(dimension[1]);
  return dimension[2] === "px"
    ? number
    : (number * (dimension[2] === "vw" ? width : height)) / 100;
}

describe("rear identity header budget", () => {
  it.each([
    [1920, 900],
    [1440, 900],
    [390, 844],
    [390, 600],
    [844, 390],
    [568, 320],
  ])(
    "keeps the complete original-ratio logo stack above the model band at %dx%d",
    (width, height) => {
      const header = declarations(".home-signature-identity", width, height);
      const eyebrow = declarations(
        ".home-signature-identity > p",
        width,
        height,
      );
      const mark = {
        ...declarations(".gtr-metal-wordmark", width, height),
        ...declarations(
          ".home-signature-identity .gtr-metal-wordmark",
          width,
          height,
        ),
      };
      const pixel = (value: string) => length(value, width, height);
      const badgeWidth = pixel(mark["--gtr-badge-width"]);
      const nissanWidth = pixel(mark["--gtr-nissan-width"]);
      const bandBottom =
        pixel(header.top) +
        pixel(eyebrow["font-size"]) * Number(eyebrow["line-height"] ?? 1.6) +
        pixel(eyebrow["margin-bottom"]) +
        (nissanWidth * 727) / 850 +
        pixel(mark.gap) +
        (badgeWidth * 450) / 640;
      expect(
        bandBottom,
        "Header must end before the reserved vehicle region",
      ).toBeLessThanOrEqual(height * 0.28);
      expect(nissanWidth).toBeLessThan(badgeWidth * 0.35);
      expect(badgeWidth).toBeGreaterThanOrEqual(40);
      expect(badgeWidth).toBeLessThanOrEqual(80);
      if (width > 700 && height > 600)
        expect(bandBottom).toBeLessThanOrEqual(height * 0.14);
    },
  );
});

describe("short-portrait car, caption and footer clearance", () => {
  it.each([600, 667, 700])(
    "leaves caption below the conservative car bottom and above footer at390×%d",
    (height) => {
      const width = 390;
      const pixel = (value: string) => length(value, width, height);
      const caption = declarations(".home-signature-caption", width, height);
      const paragraph = declarations(
        ".home-signature-caption p",
        width,
        height,
      );
      const support = declarations(
        ".home-signature-caption > span",
        width,
        height,
      );
      const canvas = declarations(
        ".cinematic-home .home-signature-canvas",
        width,
        height,
      );
      const footer = declarations(
        ".cinematic-home .home-signature-footer",
        width,
        height,
      );
      const link = declarations(
        ".cinematic-home .home-signature-footer a",
        width,
        height,
      );
      const canvasHeight = height - pixel(canvas.bottom ?? "0px");
      // Same camera equations; normalized asset is grounded and extends to z=-2.35.
      // This bottom-plane corner is conservative relative to the actual tires.
      const aspect = width / canvasHeight;
      const distance = Math.max(
        5.3,
        2.12 / (2 * Math.tan(Math.PI / 12) * aspect * 0.86),
      );
      const camera = new PerspectiveCamera(30, aspect, 0.05, 70);
      camera.position.set(0, 0.96, -2.35 - distance * (0.9 + 0.1 * 0.75));
      camera.lookAt(0, 0.66, -1.6);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const projectedBottom =
        ((1 - new Vector3(0, 0, -2.35).project(camera).y) * canvasHeight) / 2;
      const captionHeight =
        pixel(paragraph["font-size"]) *
          Number(paragraph["line-height"] ?? 1.6) *
          2 +
        pixel(paragraph["margin-bottom"] ?? paragraph.margin.split(" ")[2]) +
        pixel(support["font-size"]) * Number(support["line-height"]);
      const captionBottom = height - pixel(caption.bottom) + 4; // Existing p=.75 translation.
      const footerTop =
        height -
        pixel(footer.bottom) -
        pixel(link["min-height"]) * 2 -
        pixel(footer.gap);
      expect(captionBottom - captionHeight).toBeGreaterThanOrEqual(
        projectedBottom + 12,
      );
      expect(captionBottom).toBeLessThanOrEqual(footerTop - 8);
    },
  );

  it("retains the accepted844px mobile composition", () => {
    expect(declarations(".home-signature-caption", 390, 844).bottom).toBe(
      "24%",
    );
    expect(
      declarations(".home-signature-caption p", 390, 844)["font-size"],
    ).toBe("22px");
    expect(
      declarations(".cinematic-home .home-signature-canvas", 390, 844).bottom,
    ).toBeUndefined();
  });
});

describe("portrait identity grouping", () => {
  it.each([
    [390, 844],
    [390, 600],
    [430, 932],
  ])(
    "brings the identity toward the vehicle without moving or enlarging the stage at %dx%d",
    (width, height) => {
      const header = declarations(".home-signature-identity", width, height);
      const top = length(header.top, width, height);
      expect(top).toBeGreaterThanOrEqual(height * 0.12);
      expect(top).toBeLessThanOrEqual(height * 0.15);
      expect(
        declarations(".cinematic-home .home-signature-runway", width, height)
          .height,
      ).toBe("230svh");
    },
  );
});
