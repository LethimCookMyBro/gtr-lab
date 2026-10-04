import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  canvasPixelHash,
  assertDistinctScenePixels,
  assertMobileViewerLayout,
  observeOverlayRectangles,
} from "../scripts/environment-pixel-comparison.mjs";

const { PNG } = createRequire(import.meta.url)(
  "playwright-core/lib/utilsBundle",
);
const bounds = { x: 0, y: 0, width: 100, height: 100 };
const overlay = [
  { name: ".config-title::before", x: 10, y: 10, width: 20, height: 20 },
];
function fixture(changes = []) {
  const png = new PNG({ width: 100, height: 100 });
  png.data.fill(40);
  for (let p = 3; p < png.data.length; p += 4) png.data[p] = 255;
  for (const [x, y] of changes) png.data[(y * 100 + x) * 4] += 1;
  return PNG.sync.write(png);
}
const fileHash = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("exact visible-scene pixel comparison", () => {
  it("excludes a one-level DOM-overlay pixel while preserving untouched PNG evidence", () => {
    const original = fixture();
    const changed = fixture([[15, 15]]);
    const before = Buffer.from(original);
    expect(fileHash(original)).not.toBe(fileHash(changed));
    expect(canvasPixelHash(original, bounds, overlay).sha256).toBe(
      canvasPixelHash(changed, bounds, overlay).sha256,
    );
    expect(original.equals(before)).toBe(true);
  });
  it("retains exact sensitivity to one level at an unoccluded scene pixel", () => {
    expect(canvasPixelHash(fixture(), bounds, overlay).sha256).not.toBe(
      canvasPixelHash(fixture([[50, 50]]), bounds, overlay).sha256,
    );
  });
  it("includes observed overlay coordinates in the hash even on uniform pixels", () => {
    const original = [{ ...overlay[0], x: 10.1 }];
    const moved = [{ ...overlay[0], x: 10.25 }];
    expect(
      canvasPixelHash(fixture(), bounds, original).exclusions[0].pixels,
    ).toEqual(canvasPixelHash(fixture(), bounds, moved).exclusions[0].pixels);
    expect(canvasPixelHash(fixture(), bounds, original).sha256).not.toBe(
      canvasPixelHash(fixture(), bounds, moved).sha256,
    );
  });
  it("records the exact observed and outward-rounded clipped rectangles", () => {
    const result = canvasPixelHash(fixture(), bounds, [
      { name: "title", x: -4.5, y: 8.25, width: 20, height: 10.5 },
    ]);
    expect(result.exclusions).toEqual([
      {
        name: "title",
        observed: { x: -4.5, y: 8.25, width: 20, height: 10.5 },
        pixels: { x: 2, y: 8, width: 14, height: 11 },
      },
    ]);
    expect(result.comparedPixels).toBe(96 * 96 - 14 * 11);
    expect(result.canvasPixels).toBe(10000);
    expect(result.contract).toBe("visible-scene-rgba-v2");
  });
  it("counts overlapping exclusions once and keeps all other pixels exact", () => {
    const result = canvasPixelHash(fixture(), bounds, [
      overlay[0],
      { ...overlay[0], name: "title", x: 20 },
    ]);
    expect(result.comparedPixels).toBe(96 * 96 - 30 * 20);
  });
  it("refuses a comparison covering half or less of the original canvas", () => {
    expect(() =>
      canvasPixelHash(fixture(), bounds, [
        { name: "oversized", x: 0, y: 0, width: 55, height: 100 },
      ]),
    ).toThrow(/more than half/);
  });
  it("ignores overlays wholly outside the canvas", () => {
    expect(
      canvasPixelHash(fixture(), bounds, [
        { name: "toolbar", x: 120, y: 0, width: 10, height: 20 },
      ]).sha256,
    ).toBe(canvasPixelHash(fixture(), bounds, []).sha256);
  });
  it("still excludes only the existing two-pixel focus perimeter", () => {
    expect(canvasPixelHash(fixture([[1, 50]]), bounds, []).sha256).toBe(
      canvasPixelHash(fixture(), bounds, []).sha256,
    );
    expect(canvasPixelHash(fixture([[2, 50]]), bounds, []).sha256).not.toBe(
      canvasPixelHash(fixture(), bounds, []).sha256,
    );
  });
  it("rejects malformed observed coordinates rather than widening the mask", () => {
    expect(() =>
      canvasPixelHash(fixture(), bounds, [{ ...overlay[0], width: NaN }]),
    ).toThrow(/overlay/);
  });
});

afterEach(() => vi.unstubAllGlobals());
function observedDom({ pseudo = {}, missing = false, wrapper = null } = {}) {
  const title = { rect: { x: 24, y: 102, width: 200, height: 100 } };
  const header = { rect: { x: 0, y: 0, width: 390, height: 90 } };
  const toolbar = { rect: { x: 0, y: 602, width: 390, height: 80 } };
  const controls = [
    { rect: { x: 24, y: 550, width: 100, height: 44 } },
    { rect: { x: 220, y: 550, width: 140, height: 44 } },
    { rect: { x: 0, y: 0, width: 0, height: 0 }, hidden: true },
  ];
  const informationHeader = {
    rect: wrapper || { x: 0, y: 0, width: 0, height: 0 },
  };
  const elements = {
    ".config-information-header": informationHeader,
    ".config-title": title,
    ".config-header": header,
    ".config-toolbar": toolbar,
  };
  for (const e of [...Object.values(elements), ...controls])
    e.getBoundingClientRect = () => e.rect;
  vi.stubGlobal("document", {
    querySelector: (selector) => (missing ? null : elements[selector]),
    querySelectorAll: (selector) =>
      selector === ".scene-bottom > *" ? controls : [],
  });
  vi.stubGlobal("getComputedStyle", (element, selector) =>
    selector
      ? {
          content: '""',
          display: "block",
          visibility: "visible",
          opacity: "1",
          position: "absolute",
          top: "-44px",
          right: "-64px",
          bottom: "-44px",
          left: "-64px",
          transform: "none",
          marginTop: "0px",
          marginRight: "0px",
          marginBottom: "0px",
          marginLeft: "0px",
          ...pseudo,
        }
      : {
          display: element.hidden ? "none" : "block",
          visibility: "visible",
          opacity: "1",
          borderTopWidth: "0px",
          borderRightWidth: "0px",
          borderBottomWidth: "0px",
          borderLeftWidth: "0px",
          transform: "none",
        },
  );
}

describe("observed DOM exclusion rectangles", () => {
  it("includes computed title pseudo-element insets and individual bottom controls", () => {
    observedDom();
    const rectangles = observeOverlayRectangles();
    expect(rectangles).toContainEqual({
      name: ".config-title::before",
      x: -40,
      y: 58,
      width: 328,
      height: 188,
    });
    expect(rectangles).toContainEqual({
      name: ".config-title",
      x: 24,
      y: 102,
      width: 200,
      height: 100,
    });
    expect(rectangles).toContainEqual({
      name: ".config-header",
      x: 0,
      y: 0,
      width: 390,
      height: 90,
    });
    expect(rectangles).toContainEqual({
      name: ".config-toolbar",
      x: 0,
      y: 602,
      width: 390,
      height: 80,
    });
    expect(
      rectangles.filter((r) => r.name.startsWith(".scene-bottom")),
    ).toHaveLength(2);
    expect(rectangles.find((r) => r.name === ".scene-bottom")).toBeUndefined();
  });
  it("omits the pseudo-element where no generated content is present", () => {
    observedDom({ pseudo: { content: "none" } });
    expect(
      observeOverlayRectangles().some((r) => r.name.endsWith("::before")),
    ).toBe(false);
    expect(observeOverlayRectangles().length).toBe(5);
  });
  it("fails closed if a required overlay cannot be observed", () => {
    observedDom({ missing: true });
    expect(() => observeOverlayRectangles()).toThrow(/Missing.*overlay/);
  });
  it("fails closed for an unsupported pseudo-element geometry", () => {
    observedDom({ pseudo: { left: "auto" } });
    expect(() => observeOverlayRectangles()).toThrow(/inset/);
  });
});

it("observes the information header when it has a box and ignores desktop display-contents geometry", () => {
  observedDom({
    wrapper: { x: 0, y: 0, width: 390, height: 210 },
    pseudo: { content: "none" },
  });
  expect(observeOverlayRectangles()).toContainEqual({
    name: ".config-information-header",
    x: 0,
    y: 0,
    width: 390,
    height: 210,
  });
  observedDom({ pseudo: { content: "none" } });
  expect(
    observeOverlayRectangles().some(
      (r) => r.name === ".config-information-header",
    ),
  ).toBe(false);
});

function mobileLayout() {
  return {
    viewport: { width: 390, height: 844 },
    header: { x: 0, y: 0, width: 390, height: 210 },
    canvas: { x: 0, y: 210, width: 390, height: 392 },
    nav: { x: 0, y: 0, width: 390, height: 77 },
    title: { x: 0, y: 77, width: 390, height: 128 },
    provenance: { x: 24, y: 157, width: 200, height: 44 },
    touchControls: Array.from({ length: 6 }, (_, i) => ({
      x: 12 + i * 60,
      y: 612,
      width: 60,
      height: 73,
    })),
  };
}
describe("mobile header and retained touch controls", () => {
  it("accepts the 210px information header adjoining a 392px viewer", () => {
    expect(() => assertMobileViewerLayout(mobileLayout())).not.toThrow();
  });
  it("rejects a shortened, vertically displaced information header", () => {
    const layout = mobileLayout();
    layout.header.y = 10;
    layout.header.height = 200;
    layout.nav.y = 10;
    layout.nav.height = 67;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/210px.*header/);
  });
  it("rejects title content extending into the viewer", () => {
    const layout = mobileLayout();
    layout.title.height = 140;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/title.*inside/);
  });
  it("rejects a canvas gap or overlap at the header boundary", () => {
    const layout = mobileLayout();
    layout.canvas.y = 208;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/boundary/);
  });
  it("rejects a header/viewer boundary away from 210px", () => {
    const layout = mobileLayout();
    layout.header.height = 220;
    layout.canvas.y = 220;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/210/);
  });
  it("rejects a viewer shorter than 390px", () => {
    const layout = mobileLayout();
    layout.canvas.height = 389;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/390/);
  });
  it("rejects missing or undersized touch controls", () => {
    const layout = mobileLayout();
    layout.touchControls[0].width = 43;
    expect(() => assertMobileViewerLayout(layout)).toThrow(/44/);
    layout.touchControls = [];
    expect(() => assertMobileViewerLayout(layout)).toThrow(/touch controls/);
  });
});

function comparisonImage(bytes, rectangles = overlay) {
  const comparison = canvasPixelHash(bytes, bounds, rectangles);
  return {
    canvasSha256: comparison.sha256,
    comparisonLayout: comparison.layout,
  };
}
describe("claims of changed scene pixels", () => {
  it("rejects moved overlay layout with identical captured pixels", () => {
    const bytes = fixture();
    const first = comparisonImage(bytes, [{ ...overlay[0], x: 10.1 }]);
    const moved = comparisonImage(bytes, [{ ...overlay[0], x: 10.25 }]);
    expect(first.canvasSha256).not.toBe(moved.canvasSha256);
    expect(() =>
      assertDistinctScenePixels([first, moved], "Orbit did not move"),
    ).toThrow(/comparison layout/i);
  });
  it("accepts a one-level unoccluded pixel change with identical layout", () => {
    const first = comparisonImage(fixture());
    const changed = comparisonImage(fixture([[50, 50]]));
    expect(() =>
      assertDistinctScenePixels([first, changed], "Scene did not change"),
    ).not.toThrow();
  });
  it("requires the same comparison layout across every member of a distinct environment set", () => {
    const first = comparisonImage(fixture());
    const second = comparisonImage(fixture([[50, 50]]));
    const moved = comparisonImage(fixture(), [{ ...overlay[0], x: 11 }]);
    expect(() =>
      assertDistinctScenePixels(
        [first, second, moved],
        "Duplicate environments",
      ),
    ).toThrow(/comparison layout/i);
  });
  it("still rejects duplicated visible pixels with stable layout", () => {
    const first = comparisonImage(fixture());
    expect(() =>
      assertDistinctScenePixels([first, first], "Pixels must differ"),
    ).toThrow(/Pixels must differ/);
  });
  it("fails closed when a capture or its layout evidence is missing", () => {
    expect(() => assertDistinctScenePixels([], "Missing captures")).toThrow(
      /at least two/,
    );
    expect(() =>
      assertDistinctScenePixels(
        [{ canvasSha256: "a" }, { canvasSha256: "b" }],
        "Missing layouts",
      ),
    ).toThrow(/comparison layout/i);
  });
});
