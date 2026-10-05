import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";

const eras = [
  { year: "1969", name: "1969: Skyline GT-R" },
  { year: "1989", name: "1989: R32 GT-R" },
  { year: "1999", name: "1999: R34 GT-R" },
  { year: "2007", name: "2007: R35 GT-R" },
];
const motionProperties = [
  "--exhibition-progress",
  "--exhibition-year-shift",
  "--exhibition-lead-reveal",
  "--exhibition-road-reveal",
  "--exhibition-engine-reveal",
];

async function scrollRest(page: Page) {
  expect(
    await page.evaluate(async () => {
      let previous = scrollY;
      let stable = 0;
      for (let frame = 0; frame < 240; frame++) {
        await new Promise(requestAnimationFrame);
        stable = Math.abs(scrollY - previous) < 0.5 ? stable + 1 : 0;
        previous = scrollY;
        if (stable >= 8) return true;
      }
      return false;
    }),
    "native scrolling settles before the next gesture",
  ).toBe(true);
}

async function settleMedia(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#home-heritage img").evaluateAll(async (nodes) => {
    await Promise.all(
      (nodes as HTMLImageElement[]).map(async (image) => {
        image.loading = "eager";
        await image.decode();
      }),
    );
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

async function openArchive(page: Page, settled = true) {
  // These are isolated archive layout tests. Real loading/rendering and
  // unmodified native-wheel video are covered by the exhibition preview suite.
  await page.route("https://media.flixel.com/**", (route) => route.abort());
  await page.goto("/");
  await continueHomeWithout3D(page);
  if (settled) await settleMedia(page);
  await page.locator("#home-heritage").scrollIntoViewIfNeeded();
}

async function selectEra(page: Page, index: number, pointer = false) {
  const button = page.getByRole("button", {
    name: eras[index].name,
    exact: true,
  });
  if (pointer) await button.click();
  else {
    await button.focus();
    await button.press("Enter");
  }
  await scrollRest(page);
  const chapter = page.locator(`[data-era-image="${index}"]`);
  await expect(chapter).toBeFocused();
  await expect(chapter).toHaveCSS("outline-style", "none");
  await expect(button).toHaveAttribute("aria-current", "step");
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      chapter.getByRole("heading").evaluate((node) => {
        const rail = document
          .querySelector(".home-archive-stage")!
          .getBoundingClientRect();
        return node.getBoundingClientRect().top - rail.bottom;
      }),
    )
    .toBeGreaterThan(8);
  return chapter;
}

async function capture(page: Page, info: TestInfo, name: string) {
  // Do not disable animations, force opacity, move elements, or synthesize frames.
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: "css" });
}

async function composition(chapter: Locator) {
  return chapter.evaluate((node) => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const copy = node.querySelector(".home-archive-inline-copy")!;
    const year = node.querySelector(".home-archive-year")!;
    const range = document.createRange();
    range.selectNodeContents(year);
    const ink = range.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth > innerWidth,
      stage: rect(node.querySelector(".home-archive-exhibition")!),
      copy: rect(copy),
      year: {
        text: year.textContent,
        center: ink.left + ink.width / 2,
        top: ink.top,
        bottom: ink.bottom,
      },
      photos: [...node.querySelectorAll("figure")].map((figure) => {
        const image = figure.querySelector("img")!;
        const caption = figure.querySelector("figcaption")!;
        const credit = caption.querySelector("a")!;
        return {
          rect: rect(figure),
          image: rect(image),
          caption: rect(caption),
          loaded: image.complete && image.naturalWidth > 0,
          fit: getComputedStyle(image).objectFit,
          clip: getComputedStyle(image).clipPath,
          credit: credit.getAttribute("href"),
          text: caption.textContent?.trim(),
          imageRatio: image.naturalWidth / image.naturalHeight,
        };
      }),
    };
  });
}

function assertNoOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  expect(
    width <= 1 || height <= 1,
    "copy and photographic evidence do not overlap",
  ).toBe(true);
}

async function assertPhotos(chapter: Locator) {
  await expect(chapter.locator("figure")).toHaveCount(3);
  const geometry = await composition(chapter);
  expect(geometry.overflow).toBe(false);
  for (const photo of geometry.photos) {
    expect(photo.loaded).toBe(true);
    // Bounded image boxes may contain letterboxing. Contain preserves the
    // complete source photograph; box/source aspect equality is not required.
    expect(photo.fit).toBe("contain");
    expect(photo.clip).toBe("none");
    expect(photo.imageRatio).toBeGreaterThan(0);
    expect(photo.image.width).toBeGreaterThan(0);
    expect(photo.image.height).toBeGreaterThan(0);
    expect(photo.caption.top).toBeGreaterThanOrEqual(photo.image.bottom - 1);
    expect(photo.caption.bottom).toBeLessThanOrEqual(photo.rect.bottom + 1);
    expect(photo.credit).toMatch(/^\/credits#/);
    expect(photo.text?.length).toBeGreaterThan(12);
  }
  return geometry;
}

async function assertReadingHold(chapter: Locator) {
  await expect(chapter.locator(".home-archive-exhibition")).toHaveCSS(
    "position",
    "sticky",
  );
  await expect
    .poll(() =>
      chapter.evaluate((node) =>
        Number(
          (node as HTMLElement).style.getPropertyValue("--exhibition-progress"),
        ),
      ),
    )
    .toBeCloseTo(0.65, 1);
  const geometry = await assertPhotos(chapter);
  expect(geometry.stage.top).toBeGreaterThanOrEqual(149);
  expect(geometry.stage.bottom).toBeLessThanOrEqual(
    geometry.viewport.height + 1,
  );
  expect(
    Math.abs(
      (geometry.copy.left + geometry.copy.right) / 2 -
        geometry.viewport.width / 2,
    ),
  ).toBeLessThan(8);
  expect(
    Math.abs(geometry.year.center - geometry.viewport.width / 2),
  ).toBeLessThan(8);
  for (const photo of geometry.photos) {
    assertNoOverlap(geometry.copy, photo.rect);
    expect(photo.rect.top).toBeGreaterThanOrEqual(geometry.stage.top - 1);
    expect(photo.rect.bottom).toBeLessThanOrEqual(geometry.stage.bottom + 1);
  }
  for (const [index, photo] of geometry.photos.entries())
    for (const other of geometry.photos.slice(index + 1))
      assertNoOverlap(photo.rect, other.rect);
  for (const property of motionProperties.slice(2)) {
    expect(
      await chapter.evaluate(
        (node, name) =>
          Number((node as HTMLElement).style.getPropertyValue(name)),
        property,
      ),
    ).toBe(1);
  }
  expect(
    await chapter.evaluate((node) =>
      Number.parseFloat(
        (node as HTMLElement).style.getPropertyValue("--exhibition-year-shift"),
      ),
    ),
  ).toBe(0);
  await expect(chapter.locator(".home-archive-year-slot")).toHaveCSS(
    "overflow-y",
    /hidden|clip/,
  );
  return geometry;
}

async function wheelToProgress(page: Page, chapter: Locator, progress: number) {
  const target = await chapter.evaluate((node, p) => {
    const stage = node.querySelector<HTMLElement>(".home-archive-exhibition")!;
    return (
      scrollY +
      node.getBoundingClientRect().top -
      Number.parseFloat(getComputedStyle(stage).top) +
      (node.clientHeight - stage.offsetHeight - 52) * p
    );
  }, progress);
  const delta = target - (await page.evaluate(() => scrollY));
  for (let step = 0; step < 10; step++) {
    await page.mouse.wheel(0, delta / 10);
    await page.waitForTimeout(65);
  }
  await scrollRest(page);
}

for (const viewport of [
  { width: 1051, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`all four centered exhibitions fit the reading hold at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await openArchive(page);
    for (const index of [0, 1, 2, 3, 0]) {
      const chapter = await selectEra(page, index);
      await expect(chapter.locator(".home-archive-year")).toHaveText(
        eras[index].year,
      );
      await expect(chapter.locator(".home-archive-achievement")).toBeVisible();
      await expect(chapter.locator(".home-archive-description")).toBeVisible();
      const geometry = await assertReadingHold(chapter);
      await capture(
        page,
        info,
        `centered-${eras[index].year}-${viewport.width}x${viewport.height}`,
      );
      await info.attach(`composition-${eras[index].year}`, {
        body: JSON.stringify(geometry, null, 2),
        contentType: "application/json",
      });
    }
    await expect(page.locator(".home-archive-year")).toHaveCount(4);
    await expect(
      page.locator('[data-era-image="1"] .home-archive-image img'),
    ).toHaveAttribute("src", /archive-r32-oran-park/);
  });
}

for (const viewport of [
  { width: 375, height: 600 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 600 },
]) {
  test(`sequential natural reading has complete photographs and no overlap at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await openArchive(page);
    for (const index of [0, 1, 2, 3]) {
      const chapter = await selectEra(page, index);
      await expect(chapter.locator(".home-archive-exhibition")).not.toHaveCSS(
        "position",
        "sticky",
      );
      const geometry = await assertPhotos(chapter);
      expect(Math.abs(geometry.year.center - viewport.width / 2)).toBeLessThan(
        8,
      );
      expect(geometry.copy.bottom).toBeLessThanOrEqual(
        geometry.photos[0].rect.top + 1,
      );
      for (const [photoIndex, photo] of geometry.photos.entries()) {
        assertNoOverlap(geometry.copy, photo.rect);
        if (photoIndex > 0 && (viewport.width < 701 || photoIndex === 2))
          expect(photo.rect.top).toBeGreaterThanOrEqual(
            geometry.photos[photoIndex - 1].rect.bottom,
          );
        if (viewport.width < 701)
          expect(photo.rect.width).toBeGreaterThan(viewport.width * 0.84);
      }
      await capture(
        page,
        info,
        `natural-${eras[index].year}-${viewport.width}x${viewport.height}`,
      );
      await chapter.screenshot({
        path: info.outputPath(
          `entire-${eras[index].year}-${viewport.width}x${viewport.height}.png`,
        ),
        scale: "css",
      });
    }
  });
}

test("keyboard and pointer era selection both land on the complete centered reading hold", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await openArchive(page);
  const first = page.getByRole("button", { name: eras[0].name, exact: true });
  await first.focus();
  await expect(first).toHaveCSS("outline-width", "2px");
  for (const pointer of [false, true]) {
    for (const index of [1, 2, 3, 0]) {
      const chapter = await selectEra(page, index, pointer);
      await assertReadingHold(chapter);
      if (pointer)
        expect(
          await chapter.evaluate((node) => node.matches(":focus-visible")),
        ).toBe(false);
      await capture(
        page,
        info,
        `${pointer ? "pointer" : "keyboard"}-hold-${eras[index].year}`,
      );
    }
  }
});

test("every chapter has ordered and reversible native-wheel entrance, hold and exit", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await openArchive(page);
  const evidence = [];
  for (const index of [0, 1, 2, 3]) {
    const chapter = page.locator(`[data-era-image="${index}"]`);
    const snapshots: Array<{ name: string; state: Record<string, number> }> =
      [];
    for (const [name, progress] of [
      ["enter", 0],
      ["reveal", 0.3],
      ["hold", 0.65],
      ["exit", 0.98],
      ["reverse-hold", 0.65],
      ["reverse-enter", 0],
    ] as const) {
      await wheelToProgress(page, chapter, progress);
      await expect(page.locator("#home-heritage")).toHaveAttribute(
        "data-active-era",
        String(index),
      );
      const state = await chapter.evaluate(
        (node, properties) =>
          Object.fromEntries(
            properties.map((property) => [
              property,
              Number.parseFloat(
                (node as HTMLElement).style.getPropertyValue(property),
              ),
            ]),
          ),
        motionProperties,
      );
      expect(state["--exhibition-progress"]).toBeCloseTo(progress, 1);
      for (const property of motionProperties)
        expect(Number.isFinite(state[property])).toBe(true);
      if (name.includes("hold")) await assertReadingHold(chapter);
      snapshots.push({ name, state });
      await capture(page, info, `native-${eras[index].year}-${name}`);
    }
    expect(snapshots[0].state["--exhibition-year-shift"]).toBeGreaterThan(
      snapshots[2].state["--exhibition-year-shift"],
    );
    expect(snapshots[0].state["--exhibition-lead-reveal"]).toBeLessThan(
      snapshots[2].state["--exhibition-lead-reveal"],
    );
    expect(
      snapshots[1].state["--exhibition-lead-reveal"],
    ).toBeGreaterThanOrEqual(snapshots[1].state["--exhibition-road-reveal"]);
    expect(
      snapshots[1].state["--exhibition-road-reveal"],
    ).toBeGreaterThanOrEqual(snapshots[1].state["--exhibition-engine-reveal"]);
    for (const property of motionProperties)
      expect(snapshots[5].state[property]).toBeCloseTo(
        snapshots[0].state[property],
        1,
      );
    evidence.push({ year: eras[index].year, snapshots });
  }
  // Return across chapter boundaries using real input, not navigation callbacks.
  for (const index of [2, 1, 0]) {
    await wheelToProgress(
      page,
      page.locator(`[data-era-image="${index}"]`),
      0.65,
    );
    await expect(
      page.getByRole("button", { name: eras[index].name, exact: true }),
    ).toHaveAttribute("aria-current", "step");
  }
  await info.attach("all-era-native-forward-reverse", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
});

test("switching to reduced motion clears exhibition scores and leaves all content in static flow", async ({
  page,
}, info) => {
  await openArchive(page);
  await wheelToProgress(page, page.locator('[data-era-image="1"]'), 0.3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const index of [0, 1, 2, 3]) {
    const chapter = await selectEra(page, index);
    await expect(chapter.locator(".home-archive-exhibition")).not.toHaveCSS(
      "position",
      "sticky",
    );
    for (const selector of [
      ".home-archive-inline-copy",
      ".home-archive-year",
      "figure",
    ]) {
      for (const element of await chapter.locator(selector).all()) {
        await expect(element).toHaveCSS("opacity", "1");
        await expect(element).toHaveCSS("transform", "none");
      }
    }
    expect(
      await chapter.evaluate(
        (node, properties) =>
          properties.map((name) =>
            (node as HTMLElement).style.getPropertyValue(name),
          ),
        motionProperties,
      ),
    ).toEqual(motionProperties.map(() => ""));
    await assertPhotos(chapter);
    await capture(page, info, `reduced-static-${eras[index].year}`);
  }
});

test("cold chapter navigation stays readable after lazy photographs and fonts settle", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await openArchive(page, false);
  const chapter = await selectEra(page, 3);
  await settleMedia(page);
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("button", { name: eras[3].name, exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await assertPhotos(chapter);
  await capture(page, info, "cold-r35-settled");
  await selectEra(page, 3);
});
