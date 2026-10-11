import { continueHomeWithout3D } from "./helpers/home-gate";
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/models/ciasny-r35.glb", (route) =>
    route.fulfill({
      status: 503,
      body: "Deliberate motion-only failure; explicit non-3D path",
    }),
  );
});

// App-side transition evidence only. An iframe load or screenshot cannot establish
// external Flixel playback; real provider acceptance remains a separate review.
async function resolveOpening(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".home-hero-runway")).toBeVisible();
  // This is a hero-layout test, so explicitly use the non-3D path.
  await continueHomeWithout3D(page);
  await expect(page.locator(".home-hero-runway")).toHaveAttribute(
    "data-opening-resolved",
    "true",
    { timeout: 25000 },
  );
  await expect(page.locator(".home-opening")).not.toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect.poll(() => surface(page)).toEqual({ opacity: 1, y: 0 });
}

async function progressTo(page: Page, progress: number) {
  const hero = page.locator(".home-hero-runway");
  await hero.evaluate((node, value) => {
    const box = node.getBoundingClientRect();
    const panel = node.querySelector<HTMLElement>(".home-hero-sticky")!;
    window.scrollTo({
      top:
        scrollY +
        box.top +
        Math.max(0, panel.offsetHeight - innerHeight) +
        (box.height - panel.offsetHeight) * value,
      behavior: "instant",
    });
  }, progress);
  await expect
    .poll(() =>
      hero.evaluate((node) =>
        Number((node as HTMLElement).style.getPropertyValue("--progress")),
      ),
    )
    .toBeCloseTo(progress, 2);
}

async function surface(page: Page) {
  return page.locator(".home-hero-sticky").evaluate((node) => {
    const css = getComputedStyle(node);
    const matrix =
      css.transform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(css.transform);
    return { opacity: Number(css.opacity), y: matrix.m42 };
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "allow",
    scale: "css",
  });
}

test("hero exit reverses cleanly and hands the complete player into paper", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  if (info.project.name === "home-wide") {
    // Matches the user's wide, shorter-than-the-player inspection case.
    await page.setViewportSize({ width: 1920, height: 900 });
  }
  await resolveOpening(page);
  const iframe = page.locator(".home-film--hero iframe");
  await expect(iframe).toHaveCount(1);
  const original = await iframe.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      source: (node as HTMLIFrameElement).src,
    };
  });
  expect(original.width / original.height).toBeCloseTo(16 / 9, 2);
  expect(original.source).toContain("media.flixel.com/cinemagraph/");
  expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
  await expect(page.locator("#home-title")).toBeFocused();
  await progressTo(page, 0.76);
  await expect(page.locator(".home-hero-copy")).toHaveCSS("opacity", /0\.23/);
  await expect(page.locator("#home-title")).toBeFocused();
  await progressTo(page, 0);
  await capture(page, info, "hero-opening-unchanged");

  const samples = [];
  for (const progress of [0.52, 0.76, 1, 0.76, 0.52, 0]) {
    await progressTo(page, progress);
    const state = await surface(page);
    const expected =
      progress === 1
        ? { opacity: 0.76, y: -28 }
        : progress === 0.76
          ? { opacity: 0.88, y: -14 }
          : { opacity: 1, y: 0 };
    expect(state.opacity).toBeCloseTo(expected.opacity, 2);
    expect(state.y).toBeCloseTo(expected.y, 0);
    const geometry = await iframe.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const css = getComputedStyle(node);
      return {
        width: box.width,
        height: box.height,
        source: (node as HTMLIFrameElement).src,
        transform: css.transform,
        clipPath: css.clipPath,
        mask: css.maskImage,
      };
    });
    // Composited translation can round DOMRect dimensions by a few ten-thousandths
    // of a pixel. The provider still must keep its entire original native frame.
    expect(Math.abs(geometry.width - original.width)).toBeLessThan(0.01);
    expect(Math.abs(geometry.height - original.height)).toBeLessThan(0.01);
    expect(geometry.width / geometry.height).toBeCloseTo(16 / 9, 4);
    expect(geometry.source).toBe(original.source);
    expect(geometry.transform).toBe("none");
    expect(geometry.clipPath).toBe("none");
    expect(geometry.mask).toBe("none");
    samples.push({ progress, ...state, ...geometry });
    await capture(page, info, `hero-exit-${samples.length}-${progress}`);
  }
  await info.attach("reversible-hero-geometry", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });

  const handoff = page.locator(".home-hero-handoff");
  const continuity = await handoff.evaluate((node) => {
    const bridge = node.getBoundingClientRect();
    const hero = node.previousElementSibling!.getBoundingClientRect();
    const editorial = node.nextElementSibling!.getBoundingClientRect();
    return {
      before: bridge.top - hero.bottom,
      after: editorial.top - bridge.bottom,
      height: bridge.height,
      gradient: getComputedStyle(node).backgroundImage,
      descendants: node.childElementCount,
    };
  });
  expect(Math.abs(continuity.before)).toBeLessThan(1);
  expect(Math.abs(continuity.after)).toBeLessThan(1);
  expect(continuity.height).toBeGreaterThanOrEqual(96);
  expect(continuity.height).toBeLessThanOrEqual(168);
  expect(continuity.gradient).toContain("linear-gradient");
  expect(continuity.descendants).toBe(0);
  await handoff.evaluate((node) =>
    window.scrollTo({
      top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.55,
      behavior: "instant",
    }),
  );
  await expect.poll(() => surface(page).then((state) => state.y)).toBe(-28);
  const control = page.getByRole("button", { name: "Stop opening film" });
  await expect(control).toBeInViewport();
  expect(
    await control.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return node.contains(
        document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: /Watch original opening/ }),
  ).toBeInViewport();
  await capture(page, info, "hero-to-editorial-boundary");
  await expect(page.locator(".home-hero-runway")).toHaveAttribute(
    "data-opening-resolved",
    "true",
  );
  await progressTo(page, 0);
  await capture(page, info, "hero-returned-to-opening");
  expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("continuous native wheel input reveals and reverses the hero handoff", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await resolveOpening(page);
  await capture(page, info, "hero-native-start");
  const destination = await page
    .locator(".home-hero-handoff")
    .evaluate(
      (node) =>
        scrollY + node.getBoundingClientRect().bottom - innerHeight * 0.35,
    );
  const samples: {
    direction: string;
    scrollY: number;
    opacity: number;
    lift: number;
  }[] = [];
  const wheel = async (direction: "forward" | "reverse", distance: number) => {
    // Small real wheel events, paced by browser frames, produce continuous video.
    // No scrollTo, style mutation, or synthetic progress changes occur in the sweep.
    for (let moved = 0; moved < distance; moved += 48) {
      await page.mouse.wheel(0, direction === "forward" ? 48 : -48);
      const sample = await page.evaluate(async () => {
        for (let frame = 0; frame < 4; frame++)
          await new Promise(requestAnimationFrame);
        const css = getComputedStyle(
          document.querySelector(".home-hero-sticky")!,
        );
        return {
          scrollY,
          opacity: Number(css.opacity),
          lift:
            css.transform === "none"
              ? 0
              : new DOMMatrixReadOnly(css.transform).m42,
        };
      });
      samples.push({ direction, ...sample });
    }
  };
  await page.mouse.move(8, 8);
  await wheel("forward", destination);
  await expect
    .poll(() => surface(page).then((state) => state.opacity))
    .toBeCloseTo(0.76, 2);
  await expect(page.locator(".home-hero-handoff")).toBeInViewport();
  await capture(page, info, "hero-native-editorial-handoff");
  await wheel("reverse", (await page.evaluate(() => scrollY)) + 96);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect.poll(() => surface(page)).toEqual({ opacity: 1, y: 0 });
  await capture(page, info, "hero-native-reversed");
  for (const direction of ["forward", "reverse"]) {
    const phase = samples.filter((sample) => sample.direction === direction);
    expect(
      new Set(phase.map((sample) => Math.round(sample.scrollY))).size,
    ).toBeGreaterThan(10);
    expect(
      phase.some((sample) => sample.opacity > 0.78 && sample.opacity < 0.98),
    ).toBe(true);
    for (let index = 1; index < phase.length; index++) {
      const delta = phase[index].scrollY - phase[index - 1].scrollY;
      expect(direction === "forward" ? delta : -delta).toBeGreaterThanOrEqual(
        -1,
      );
    }
  }
  await info.attach("continuous-native-wheel-samples", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
});

test("Continue keeps heading focus while native scrolling activates the hero exit", async ({
  page,
}, info) => {
  // Hold only the real embed request long enough to exercise the real skip path.
  // No replacement player or playback evidence is introduced.
  let releaseEmbed!: () => void;
  const embedGate = new Promise<void>((resolve) => {
    releaseEmbed = resolve;
  });
  await page.route("https://media.flixel.com/cinemagraph/**", async (route) => {
    await embedGate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const skip = page.getByRole("button", { name: "Continue without 3D" });
    await expect(skip).toBeVisible();
    await skip.click();
    const heading = page.locator("#home-title");
    await expect(heading).toBeFocused();
    releaseEmbed();
    await expect(page.locator(".home-opening")).not.toBeVisible();
    const runway = await page
      .locator(".home-hero-runway")
      .evaluate(
        (node) =>
          node.getBoundingClientRect().height -
          Math.min(
            innerHeight,
            node.querySelector<HTMLElement>(".home-hero-sticky")!.offsetHeight,
          ),
      );
    await page.mouse.move(8, 8);
    await page.mouse.wheel(0, runway * 0.85);
    await expect
      .poll(() => surface(page).then((value) => value.opacity))
      .toBeLessThan(0.9);
    await expect
      .poll(() => surface(page).then((value) => value.y))
      .toBeLessThan(-10);
    await expect(heading).toBeFocused();
    await capture(page, info, "hero-continue-native-scroll");
  } finally {
    releaseEmbed();
  }
});

test("hero exit keeps focused film controls and credits fully readable", async ({
  page,
}, info) => {
  await resolveOpening(page);
  await progressTo(page, 1);
  expect((await surface(page)).opacity).toBeCloseTo(0.76, 2);
  const control = page.getByRole("button", { name: "Stop opening film" });
  await control.focus();
  await expect(control).toBeFocused();
  expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
  await control.click();
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play opening film" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".home-film--hero summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".home-film--hero details")).toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /Watch original opening/ }),
  ).toBeFocused();
  expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
  await capture(page, info, "hero-exit-keyboard-controls");
});

for (const policy of ["reduced-motion", "save-data"] as const) {
  test(`hero exit remains static with ${policy}`, async ({ page }, info) => {
    if (policy === "reduced-motion")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page.addInitScript(() => {
        const connection = new EventTarget();
        Object.defineProperty(connection, "saveData", { value: true });
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        });
      });
    await resolveOpening(page);
    const hero = page.locator(".home-hero-runway");
    await expect(hero).toHaveAttribute("data-hero-exit-enabled", "false");
    await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
    if (policy === "save-data") await progressTo(page, 0.9);
    else
      await page.evaluate(() =>
        window.scrollTo({ top: 150, behavior: "instant" }),
      );
    expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
    await capture(page, info, `hero-exit-${policy}`);
    await page.getByRole("button", { name: "Play opening film" }).click();
    await expect(page.locator(".home-film--hero iframe")).toHaveCount(1);
    await expect(hero).toHaveAttribute("data-hero-exit-enabled", "false");
    expect(await surface(page)).toEqual({ opacity: 1, y: 0 });
  });
}
