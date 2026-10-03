import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
async function reveal(page: Page, progress: number) {
  await page.locator(".home-signature-runway").evaluate((el, p) => {
    const r = el.getBoundingClientRect(),
      h = (el.firstElementChild as HTMLElement).offsetHeight;
    window.scrollTo({
      top: scrollY + r.top + (r.height - h) * p,
      behavior: "instant",
    });
  }, progress);
}
test("published R35 renders from the rear and scroll dolly changes actual pixels", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".glb")) requests.push(r.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  expect(requests).toHaveLength(0);
  const stage = page.locator(".home-signature-runway"),
    canvas = stage.locator("canvas");
  const images: string[] = [];
  for (const [i, p] of [0.08, 0.5, 0.92, 0.08].entries()) {
    await reveal(page, p);
    await expect(stage).toHaveAttribute("data-scene-state", "ready", {
      timeout: 90000,
    });
    await expect
      .poll(
        async () =>
          Math.abs(Number(await canvas.getAttribute("data-rear-progress")) - p),
        { timeout: 10000 },
      )
      .toBeLessThan(0.015);
    const bytes = await canvas.screenshot({
      path: info.outputPath(`rear-${i}-${p}.png`),
    });
    images.push(createHash("sha256").update(bytes).digest("hex"));
    if (i <= 3)
      await page.screenshot({
        path: info.outputPath(`composed-${i}-${p}.png`),
        scale: "css",
      });
  }
  // Native wheel input drives the actual browser scroll and continuously lit model.
  await reveal(page, 0.08);
  for (let step = 0; step < 18; step++) {
    await page.mouse.wheel(0, info.project.name === "rear-mobile" ? 55 : 70);
    await page.waitForTimeout(100);
  }
  await page.screenshot({
    path: info.outputPath("native-wheel-revealed.png"),
    scale: "css",
  });
  for (let step = 0; step < 18; step++) {
    await page.mouse.wheel(0, info.project.name === "rear-mobile" ? -55 : -70);
    await page.waitForTimeout(100);
  }
  await page.screenshot({
    path: info.outputPath("native-wheel-return.png"),
    scale: "css",
  });
  expect(images[0]).not.toBe(images[1]);
  expect(images[1]).not.toBe(images[2]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.endsWith("/models/ciasny-r35.glb"))).toBe(
    true,
  );
  expect(
    await canvas.evaluate(
      (el) => (el as HTMLCanvasElement).width / el.clientWidth,
    ),
  ).toBeLessThanOrEqual(info.project.name === "rear-mobile" ? 1.01 : 1.26);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-scene-state", "ready", {
    timeout: 90000,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-rear-progress")))
    .toBe(1);
  await page.screenshot({
    path: info.outputPath("rear-reduced-motion.png"),
    scale: "css",
  });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect(canvas).toHaveCount(0, { timeout: 10000 });
  expect(errors).toEqual([]);
  await info.attach("scene-evidence", {
    body: JSON.stringify({
      requests,
      hashes: images,
      errors,
      scope:
        "Real published asset rendered by Chromium SwiftShader; not physical mobile GPU certification",
    }),
    contentType: "application/json",
  });
});
test("failed rear asset remains readable and retry loads the real model", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/models/ciasny-r35.glb", (route) =>
    fail
      ? route.fulfill({ status: 503, body: "deliberate model failure" })
      : route.continue(),
  );
  await page.goto("/");
  await reveal(page, 0.5);
  const stage = page.locator(".home-signature-runway");
  await expect(stage).toHaveAttribute("data-scene-state", "error");
  await expect(
    stage.getByRole("button", { name: "Retry 3D view" }),
  ).toBeVisible();
  fail = false;
  await stage.getByRole("button", { name: "Retry 3D view" }).click();
  await expect(stage).toHaveAttribute("data-scene-state", "ready", {
    timeout: 90000,
  });
});
