import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Decode the original Playwright screenshot; never request another GPU readback
// or alter the full PNG retained as visual evidence.
const { PNG } = createRequire(import.meta.url)(
  "playwright-core/lib/utilsBundle",
);
export const PIXEL_COMPARISON_CONTRACT = "visible-scene-rgba-v2";

export function canvasPixelHash(bytes, bounds, overlays = []) {
  const png = PNG.sync.read(bytes);
  const inset = 2;
  const x = Math.ceil(bounds.x + inset);
  const y = Math.ceil(bounds.y + inset);
  const right = Math.floor(bounds.x + bounds.width - inset);
  const bottom = Math.floor(bounds.y + bounds.height - inset);
  assert(
    x >= 0 && y >= 0 && right <= png.width && bottom <= png.height,
    "Canvas comparison region extends outside the captured viewport",
  );
  assert(right > x && bottom > y, "Canvas comparison region is empty");
  const region = {
    x,
    y,
    width: right - x,
    height: bottom - y,
    insetPixels: inset,
  };
  const exclusions = overlays
    .flatMap((overlay) => {
      const { name, x: ox, y: oy, width, height } = overlay;
      assert(
        typeof name === "string" &&
          name.length &&
          [ox, oy, width, height].every(Number.isFinite) &&
          width > 0 &&
          height > 0,
        "Invalid observed DOM overlay rectangle",
      );
      const left = Math.max(x, Math.floor(ox));
      const top = Math.max(y, Math.floor(oy));
      const endX = Math.min(right, Math.ceil(ox + width));
      const endY = Math.min(bottom, Math.ceil(oy + height));
      if (left >= endX || top >= endY) return [];
      return [
        {
          name,
          observed: { x: ox, y: oy, width, height },
          pixels: { x: left, y: top, width: endX - left, height: endY - top },
        },
      ];
    })
    .sort((a, b) =>
      a.name < b.name
        ? -1
        : a.name > b.name
          ? 1
          : a.observed.y - b.observed.y || a.observed.x - b.observed.x,
    );

  // Including exact measured layout prevents a moving mask from silently
  // changing the comparison domain, even if every remaining pixel is uniform.
  const layout = JSON.stringify({ bounds: region, exclusions });
  const hash = createHash("sha256");
  hash.update(PIXEL_COMPARISON_CONTRACT + "\0" + layout + "\0");
  let comparedPixels = 0;
  for (let row = y; row < bottom; row++) {
    const intervals = exclusions
      .filter(({ pixels: p }) => row >= p.y && row < p.y + p.height)
      .map(({ pixels: p }) => [p.x, p.x + p.width])
      .sort((a, b) => a[0] - b[0]);
    let cursor = x;
    const include = (start, end) => {
      if (end <= start) return;
      hash.update(
        png.data.subarray(
          (row * png.width + start) * 4,
          (row * png.width + end) * 4,
        ),
      );
      comparedPixels += end - start;
    };
    for (const [start, end] of intervals) {
      include(cursor, start);
      cursor = Math.max(cursor, end);
    }
    include(cursor, right);
  }
  const canvasPixels = bounds.width * bounds.height;
  assert(
    comparedPixels > canvasPixels / 2,
    "Exact visible-scene comparison must retain more than half of the canvas",
  );
  return {
    sha256: hash.digest("hex"),
    bounds: region,
    exclusions,
    contract: PIXEL_COMPARISON_CONTRACT,
    layout,
    comparedPixels,
    canvasPixels,
  };
}

// This function is serialized by Playwright into the page. It only measures
// shipped DOM UI; no hidden app hooks, style changes or screenshot masking.
export function observeOverlayRectangles() {
  const rectangles = [];
  const visible = (style) =>
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0;
  const px = (value, name) => {
    if (!/^-?(?:\d+\.?\d*|\.\d+)px$/.test(value))
      throw new Error("Unsupported overlay inset: " + name + "=" + value);
    return Number.parseFloat(value);
  };
  const record = (name, element) => {
    const style = getComputedStyle(element);
    if (!visible(style)) return;
    const { x, y, width, height } = element.getBoundingClientRect();
    if (width > 0 && height > 0) rectangles.push({ name, x, y, width, height });
  };
  for (const selector of [
    ".config-information-header",
    ".config-title",
    ".config-header",
    ".config-toolbar",
  ]) {
    const element = document.querySelector(selector);
    if (!element) throw new Error("Missing required DOM overlay: " + selector);
    record(selector, element);
    if (selector !== ".config-title") continue;
    const style = getComputedStyle(element);
    const pseudo = getComputedStyle(element, "::before");
    if (
      !visible(style) ||
      !visible(pseudo) ||
      ["none", "normal", ""].includes(pseudo.content)
    )
      continue;
    if (
      pseudo.position !== "absolute" ||
      pseudo.transform !== "none" ||
      style.transform !== "none"
    )
      throw new Error("Unsupported title overlay transform/position");
    for (const property of [
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
    ]) {
      if (px(pseudo[property], property) !== 0)
        throw new Error("Unsupported title overlay margin");
    }
    const rect = element.getBoundingClientRect();
    const left = px(pseudo.left, "left"),
      right = px(pseudo.right, "right");
    const top = px(pseudo.top, "top"),
      bottom = px(pseudo.bottom, "bottom");
    const borderLeft = px(style.borderLeftWidth, "borderLeftWidth");
    const borderRight = px(style.borderRightWidth, "borderRightWidth");
    const borderTop = px(style.borderTopWidth, "borderTopWidth");
    const borderBottom = px(style.borderBottomWidth, "borderBottomWidth");
    rectangles.push({
      name: selector + "::before",
      x: rect.x + borderLeft + left,
      y: rect.y + borderTop + top,
      width: rect.width - borderLeft - borderRight - left - right,
      height: rect.height - borderTop - borderBottom - top - bottom,
    });
  }
  // Do not exclude the large, mostly empty flex row between these controls.
  document
    .querySelectorAll(".scene-bottom > *")
    .forEach((element, index) =>
      record(".scene-bottom > *[" + index + "]", element),
    );
  return rectangles;
}

export function assertMobileViewerLayout(layout) {
  const { header, canvas, viewport, nav, title, provenance, touchControls } =
    layout;
  const valid = (rect) =>
    rect &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0;
  for (const [name, rect] of Object.entries({
    header,
    canvas,
    nav,
    title,
    provenance,
  }))
    assert(valid(rect), "Missing mobile " + name + " bounds");
  assert(
    Math.abs(header.y) <= 1 && Math.abs(header.height - 210) <= 1,
    "Mobile 210px information header must start at the viewport top",
  );
  assert(
    Math.abs(header.y + header.height - canvas.y) <= 1,
    "Mobile header/canvas boundary has a gap or overlap",
  );
  assert(
    Math.abs(canvas.y - 210) <= 1,
    "Mobile viewer must begin at the 210px header boundary",
  );
  assert(
    canvas.height >= 390,
    "Mobile viewer must retain at least 390px height at 390×844",
  );
  const inside = (inner, outer) =>
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1;
  for (const [name, rect] of Object.entries({ nav, title, provenance }))
    assert(
      inside(rect, header),
      "Mobile " + name + " must remain inside information header",
    );
  assert(touchControls.length >= 5, "Mobile touch controls were removed");
  for (const rect of touchControls) {
    assert(
      valid(rect) && rect.width >= 44 && rect.height >= 44,
      "Mobile touch controls must retain 44px targets",
    );
    assert(
      inside(rect, { x: 0, y: 0, ...viewport }),
      "Mobile touch controls must remain in viewport",
    );
  }
  return layout;
}

export function assertDistinctScenePixels(images, message) {
  assert(
    images.length >= 2,
    "Pixel-change claims require at least two captures",
  );
  const layout = images[0]?.comparisonLayout;
  assert(
    typeof layout === "string" && layout.length > 0,
    "Missing comparison layout evidence",
  );
  for (const image of images) {
    assert.equal(
      image?.comparisonLayout,
      layout,
      message +
        ": comparison layout changed, so visible-pixel change is unproven",
    );
    assert(
      typeof image.canvasSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(image.canvasSha256),
      "Missing captured pixel hash evidence",
    );
  }
  // Only after every frame has the exact same pixel domain may a combined
  // layout+RGBA digest establish actual scene change or environment uniqueness.
  assert.equal(
    new Set(images.map((image) => image.canvasSha256)).size,
    images.length,
    message,
  );
}
