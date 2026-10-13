import { test, expect } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { continueHomeWithout3D } from "./helpers/home-gate";
import {
  assessNeutralLayout,
  assertFormulaESource,
  FORMULA_E_SOURCE_TREE,
  validateFormulaECI,
  FORMULA_E_SCENE_OBSTACLES,
  createFormulaERuntimeEvidence,
} from "../scripts/formula-e-layout-contract.mjs";
import {
  FORMULA_E_LIVE_ORIGIN,
  readFormulaEAssets,
  loadFormulaELiveRequest,
  assertFormulaELiveBuild,
} from "../scripts/formula-e-live-contract.mjs";
// @ts-expect-error Read-only existing production identity helper.
import { applicationIdentity } from "../scripts/diagnose-dpr-motion.mjs";
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const season = "2025/26 Season 12 · GEN3 Evo";

async function layout(
  page: Page,
  frame: Locator,
  labelRoot: Locator,
  obstacles: Locator[],
) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(
    labelRoot.getByText("Reference image unavailable", { exact: true }),
  ).toBeVisible();
  const labels = await labelRoot
    .locator(
      ".reference-unavailable-label, .reference-unavailable-context:visible",
    )
    .all();
  const viewport = page.viewportSize()!;
  const observed = {
    viewport: { x: 0, y: 0, ...viewport },
    frame: await frame.boundingBox(),
    labels: await Promise.all(labels.map((label) => label.boundingBox())),
    obstacles: await Promise.all(
      obstacles.map((obstacle) => obstacle.boundingBox()),
    ),
  };
  expect(assessNeutralLayout(observed), JSON.stringify(observed)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  return observed;
}
type RuntimeEvidence = ReturnType<typeof createFormulaERuntimeEvidence>;
const activeEvidence = new Map<TestInfo, RuntimeEvidence>();
const evidenceIdentity = new Map<TestInfo, object>();
async function runtimeEvidence(page: Page, info: TestInfo) {
  // This is the existing test budget, beginning before navigation, never renewed.
  const startedAt = performance.now();
  const window = {
    startedAt,
    budget: info.timeout,
    deadline: startedAt + info.timeout,
    clock: "node-performance" as const,
  };
  const intendedAssets = await readFormulaEAssets();
  const live = info.config.metadata.formulaEMode === "live";
  const request = live ? await loadFormulaELiveRequest() : null;
  const build = request
    ? assertFormulaELiveBuild(request, intendedAssets)
    : null;
  evidenceIdentity.set(info, {
    mode: live ? "live" : "staged",
    harnessCommit: process.env.GITHUB_SHA,
    sourceTree: FORMULA_E_SOURCE_TREE,
    ...(request
      ? {
          expectedDeployedCommit: request.expectedDeployedCommit,
          railwayDeploymentId: request.railwayDeploymentId,
          expectedBuildSha256: request.buildSha256,
          observedLocalBuildSha256: build!.sha256,
          commitEvidence:
            "Separate Railway connector readback; HTTP verifies bytes only",
        }
      : { sourceCommit: process.env.GITHUB_SHA }),
  });
  const evidence = createFormulaERuntimeEvidence(page, {
    intendedAssets,
    origin: live ? FORMULA_E_LIVE_ORIGIN : "http://127.0.0.1:4173",
    window,
  });
  evidence.beginDocument();
  activeEvidence.set(info, evidence);
  return evidence;
}
test.afterEach(async ({ page }, info) => {
  const evidence = activeEvidence.get(info);
  if (!evidence) return;
  let completionError: unknown;
  try {
    await evidence.finish();
  } catch (error) {
    completionError = error;
  }
  // Close the observation window synchronously before serializing its final state.
  // Events after the earlier success receipt but before this closure are retained.
  evidence.dispose();
  activeEvidence.delete(info);
  const runtime = evidence.snapshot();
  if (runtime.state !== "finished")
    completionError ??= new Error(
      "Runtime evidence is not a clean finished receipt",
    );
  await info.attach("formula-e-runtime-request-ledger", {
    body: Buffer.from(
      JSON.stringify(
        {
          ...evidenceIdentity.get(info),
          viewport: page.viewportSize(),
          testStatus: info.status,
          runtime,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  evidenceIdentity.delete(info);
  if (completionError && info.status === info.expectedStatus)
    throw completionError;
});
async function capture(page: Page, info: TestInfo, filename: string) {
  const bytes = await page.screenshot({
    path: info.outputPath(filename),
    animations: "disabled",
    scale: "css",
  });
  return { filename, sha256: digest(bytes) };
}
async function receipt(info: TestInfo, page: Page, data: object) {
  assertFormulaESource(await applicationIdentity("."));
  await info.attach("formula-e-source-bound-evidence", {
    body: Buffer.from(
      JSON.stringify(
        {
          ...evidenceIdentity.get(info),
          project: info.project.name,
          viewport: page.viewportSize(),
          ...data,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
}
test.beforeAll(async () => {
  validateFormulaECI();
  assertFormulaESource(await applicationIdentity("."));
});

test("Formula E collection and homepage paths keep neutral labels clear and navigate correctly", async ({
  page,
}, info) => {
  const evidence = await runtimeEvidence(page, info);
  await page.goto("/");
  await continueHomeWithout3D(page);
  const homeCard = page.getByRole("link", {
    name: "Explore Formula E: View specifications",
    exact: true,
  });
  await homeCard.scrollIntoViewIfNeeded();
  await expect(homeCard.locator("img, canvas, picture")).toHaveCount(0);
  await expect(homeCard).toContainText(season);
  const homeLayout = await layout(page, homeCard, homeCard, [
    homeCard.locator("h3"),
    homeCard.locator(".home-invitation-cta"),
  ]);
  const captures = [await capture(page, info, "formula-e-home-card.png")];
  await homeCard.focus();
  await expect(homeCard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/configurator\/formula-e$/);
  await expect(
    page.getByRole("heading", { name: "Nissan e-4ORCE 05", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to models", exact: true }).click();
  const collection = page.getByRole("link", {
    name: "Explore Nissan e-4ORCE 05",
    exact: true,
  });
  await collection.scrollIntoViewIfNeeded();
  await expect(collection.locator("img, canvas, picture")).toHaveCount(0);
  const collectionLayout = await layout(page, collection, collection, [
    collection.locator(".band-copy"),
    collection.locator(".band-action"),
  ]);
  captures.push(await capture(page, info, "formula-e-collection-card.png"));
  await collection.click();
  await expect(page).toHaveURL(/\/configurator\/formula-e$/);
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  const formulaChoice = page.getByRole("button", {
    name: "Formula E Electric racing, a different discipline.",
    exact: true,
  });
  await formulaChoice.scrollIntoViewIfNeeded();
  await expect(formulaChoice).toHaveAttribute("aria-current", "page");
  await expect(formulaChoice.locator("img, canvas, picture")).toHaveCount(0);
  const switcherLayout = await layout(page, formulaChoice, formulaChoice, [
    formulaChoice.locator(":scope > span"),
    formulaChoice.locator(":scope > svg"),
  ]);
  captures.push(await capture(page, info, "formula-e-switcher.png"));
  await formulaChoice.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/configurator\/formula-e$/);
  await page.getByRole("link", { name: "Back to models", exact: true }).click();
  await expect(page).toHaveURL(/\/models$/);
  await receipt(info, page, {
    layouts: { homeLayout, collectionLayout, switcherLayout },
    captures,
    runtime: await evidence.finish(),
  });
});

test("Formula E direct route has no image or model requests and keeps details accessible", async ({
  page,
}, info) => {
  const evidence = await runtimeEvidence(page, info);
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\.glb(?:\.gz)?$|gtr-gt500|gtr-formula-e/.test(path))
      unexpected.push(path);
  });
  await page.goto("/configurator/formula-e");
  const stage = page.locator(".reference-view");
  await expect(stage.locator("img, canvas, picture, svg")).toHaveCount(0);
  await expect(stage).toContainText(season);
  const neutralLayout = await layout(page, stage, stage, [
    ...FORMULA_E_SCENE_OBSTACLES.map((selector) => page.locator(selector)),
  ]);
  const captures = [await capture(page, info, "formula-e-neutral-route.png")];
  for (const name of ["Pearl White", "Lights", "Rotate"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  const detailsButton = page.getByRole("button", {
    name: "Model detail",
    exact: true,
  });
  await detailsButton.click();
  const details = page.getByRole("dialog");
  await expect(details).toContainText("Maximum traction power");
  await expect(details).toContainText("Not specified in source");
  await expect(
    details.locator(".model-details img, canvas, picture"),
  ).toHaveCount(0);
  const detailMedia = details.locator(".reference-unavailable");
  await detailMedia.scrollIntoViewIfNeeded();
  const detailsLayout = await layout(page, details, details, []);
  captures.push(await capture(page, info, "formula-e-details.png"));
  const source = details.getByRole("link", {
    name: "Primary source 2",
    exact: true,
  });
  await source.scrollIntoViewIfNeeded();
  await expect(source).toHaveAttribute(
    "href",
    "https://www.fia.com/news/formula-e-and-fia-unveil-gen3-evo-race-car-capable-0-60mph-just-182s",
  );
  await source.focus();
  await page.keyboard.press("Tab");
  await expect(
    details.getByRole("button", { name: "Close panel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(detailsButton).toBeFocused();
  await page
    .getByRole("button", {
      name: "Specifications only · 3D asset pending",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No rights-cleared reference image is available",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByRole("button", { name: /Interior/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await evidence.sealDocument();
  evidence.beginDocument();
  await page.goto("/configurator/gt500");
  await expect(
    page.getByRole("heading", {
      name: "GT500 is no longer in this collection.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/configurator\/gt500$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  captures.push(await capture(page, info, "formula-e-legacy-route.png"));
  await page.getByRole("link", { name: /Explore the collection/ }).click();
  await expect(page).toHaveURL(/\/models$/);
  expect(unexpected).toEqual([]);
  await receipt(info, page, {
    layouts: { neutralLayout, detailsLayout },
    captures,
    unexpectedMediaRequests: unexpected,
    runtime: await evidence.finish(),
  });
});
