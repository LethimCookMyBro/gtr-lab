import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function expectReady(page: Page) {
  await expect(page.getByTestId("status")).toHaveText("ready", {
    timeout: 30000,
  });
  await expect(page.getByTestId("progress")).toHaveText("100");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
}

test("actual GLB renders, exposes matched capabilities, and responds to paint and camera changes", async ({
  page,
}, info) => {
  await page.goto("/");
  await expectReady(page);
  await expect(page.getByTestId("paint-capability")).toHaveText("true");
  await expect(page.getByTestId("lights-capability")).toHaveText("true");
  const canvas = page.locator("canvas");
  await page.screenshot({
    path: info.outputPath("synthetic-renderer-ready.png"),
  });
  const bluePixels = (await canvas.screenshot()).toString("base64");
  await page.getByRole("button", { name: "Paint red", exact: true }).click();
  await expect
    .poll(async () => (await canvas.screenshot()).toString("base64"))
    .not.toBe(bluePixels);
  const frontPixels = (await canvas.screenshot()).toString("base64");
  await page.getByRole("button", { name: "Side view", exact: true }).click();
  await expect
    .poll(async () => (await canvas.screenshot()).toString("base64"))
    .not.toBe(frontPixels);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await expectReady(page);
  await page.screenshot({
    path: info.outputPath("synthetic-renderer-top.png"),
  });
});

test("keyboard and pointer exploration cancel rotation and keep a single live canvas", async ({
  page,
}) => {
  await page.goto("/");
  await expectReady(page);
  await page
    .getByRole("button", { name: "Start rotation", exact: true })
    .click();
  await expect(page.getByTestId("rotation")).toHaveText("true");
  const canvas = page.locator("canvas");
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await expect(page.getByTestId("manual-count")).not.toHaveText("0");
  await expect(page.getByTestId("rotation")).toHaveText("false");
  await canvas.press("+");
  await canvas.press("-");
  await canvas.press("Home");
  const count = Number(await page.getByTestId("manual-count").textContent());
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("manual-count").textContent()),
    )
    .toBeGreaterThan(count);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("invalid GLB reports an actionable error and recovers with a valid fixture", async ({
  page,
}) => {
  await page.goto("/?case=invalid");
  await expect(page.getByRole("alert")).toContainText(
    "not a valid binary glTF",
  );
  await expect(page.getByTestId("status")).toHaveText("error");
  await page
    .getByRole("button", { name: "Load valid fixture", exact: true })
    .click();
  await expectReady(page);
});

test("unavailable WebGL reports failure instead of an indefinite blank viewer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (
          kind === "webgl" ||
          kind === "webgl2" ||
          kind === "experimental-webgl"
        )
          return null;
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("error");
  await expect(page.getByRole("alert")).toContainText(
    /WebGL|3D viewer could not start/i,
  );
  await expect(
    page.getByRole("button", { name: "Retry viewer", exact: true }),
  ).toBeVisible();
});

test("context loss reports the graphics failure and retry creates a working new context", async ({
  page,
}) => {
  await page.goto("/");
  await expectReady(page);
  const hasExtension = await page.locator("canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(extension);
  });
  expect(
    hasExtension,
    "CI browser must expose WEBGL_lose_context for this real-context test",
  ).toBe(true);
  await expect(page.getByRole("alert")).toContainText(
    "graphics connection was lost",
  );
  await page.getByRole("button", { name: "Retry viewer", exact: true }).click();
  await expectReady(page);
});

test("failed HDRI falls back to studio without losing the working model", async ({
  page,
}) => {
  await page.route("**/environments/*.hdr", (route) => route.abort("failed"));
  await page.goto("/");
  await expectReady(page);
  await page
    .getByRole("button", { name: "Forest environment", exact: true })
    .click();
  await expect(page.getByTestId("environment-notice")).toContainText(
    "Switched to Studio",
  );
  await expect(page.getByTestId("environment")).toHaveText("studio");
  await expectReady(page);
  await page.getByRole("button", { name: "Paint red", exact: true }).click();
  await expect(page.getByTestId("paint-capability")).toHaveText("true");
});
