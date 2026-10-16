import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Box3, PerspectiveCamera, Texture, Vector3 } from "three";
import { createVehicleLoader } from "../src/components/three/createVehicleLoader";
import anchors from "../src/data/r35-study-camera-anchors.json";
// @ts-expect-error Existing dependency-free QA helpers are JavaScript modules.
import * as studyReadiness from "../scripts/integrated-study-readiness.mjs";
const {
  installIntegratedStudyCaptureObserver,
  armFunctionalCapture,
  waitForFunctionalCapture,
  verifyFunctionalCapture,
  verifyIntegratedStudySource,
} = studyReadiness;
// @ts-expect-error Existing passive observer, shared with accepted cabin QA.
import { installPreparationObserver } from "../scripts/cabin-preparation-observer.mjs";
// @ts-expect-error Existing passive resource observer.
import { installCabinResourceObserver } from "../scripts/cabin-resource-observer.mjs";
// @ts-expect-error Existing exact resource assertions.
import * as resourceAssertions from "../scripts/cabin-resource-assertions.mjs";
const { cabinResourceCohort, assertCabinResourcesReleased } =
  resourceAssertions;
// @ts-expect-error Existing unchanged budgets and residency/pose assertions.
import * as preparationPolicy from "../scripts/cabin-preparation-policy.mjs";
const {
  budgets,
  readinessWindow,
  remainingBudget,
  assertResidentWorkUnchanged,
  assertRestoredExteriorPose,
} = preparationPolicy;

// @ts-expect-error Existing absolute-window wrapper, with before/after checks and racing timeout.
import { boundedOperation } from "../scripts/cabin-preparation-checkpoint.mjs";
const verifiedSource = await verifyIntegratedStudySource(
  process.cwd(),
  process.env,
);
type Window = {
  startedAt: number;
  deadline: number;
  budget: number;
  clock: string;
};
const step = (
  window: Window,
  label: string,
  work: (remaining: () => number) => Promise<any>,
) => boundedOperation(window, label, work);
const modelPath = "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb";
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const bytes = readFileSync("dist" + modelPath);
expect(bytes.length).toBe(25_813_544);
expect(hash(bytes)).toBe(anchors.candidateSha256);
const jsonLength = bytes.readUInt32LE(12),
  modelJson = bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  document = JSON.parse(modelJson);
const binary = bytes.subarray(28 + jsonLength);
const expectedImages = document.images.map((image: any, index: number) => {
  expect(image.uri).toBeUndefined();
  const view = document.bufferViews[image.bufferView],
    body = binary.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    );
  return {
    name: `source-image-${index}`,
    bytes: body.length,
    mimeType: image.mimeType,
    sha256: hash(body),
  };
});
expect(expectedImages).toHaveLength(45);
const loader = createVehicleLoader();
loader.register(() => ({
  name: "CPU_SOURCE_BOUNDS",
  loadTexture: () => Promise.resolve(new Texture()),
}));
const parsed = await loader.parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
const bounds = new Box3().setFromObject(parsed.scene),
  scale =
    4.7 / Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
const translation = [
  (-(bounds.min.x + bounds.max.x) * scale) / 2,
  -bounds.min.y * scale,
  (-(bounds.min.z + bounds.max.z) * scale) / 2,
];
function expectedPose(seat: "driver" | "passenger", dimensions: any) {
  const view = anchors.sourceViews[seat],
    transform = (point: number[]) =>
      point.map((value, index) => value * scale + translation[index]);
  const camera = new PerspectiveCamera(
    view.fov,
    dimensions.renderWidth / dimensions.renderHeight,
    0.015 * scale,
    50,
  );
  camera.position.fromArray(transform(view.position));
  camera.lookAt(new Vector3(...transform(view.target)));
  camera.updateProjectionMatrix();
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    projection: camera.projectionMatrix.toArray(),
  };
}
const reports = new WeakMap<Page, any>();
test.beforeEach(async ({ page }) => {
  const report = {
    source: verifiedSource,
    modelPath,
    sha256: anchors.candidateSha256,
    viewport: page.viewportSize(),
    modelRequests: [] as string[],
    bodies: [] as any[],
    diagnostics: [] as any[],
    captures: [] as any[],
  };
  reports.set(page, report);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".glb"))
      report.modelRequests.push(new URL(request.url()).pathname);
  });
  page.on("pageerror", (error) =>
    report.diagnostics.push({ kind: "pageerror", message: error.message }),
  );
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      report.diagnostics.push({
        kind: message.type(),
        message: message.text(),
      });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === modelPath)
      report.bodies.push(
        response
          .body()
          .then((body) => ({
            status: response.status(),
            bytes: body.length,
            sha256: hash(body),
          }))
          .catch((error) => ({ error: String(error) })),
      );
  });
  await page.addInitScript({
    content: `(${installCabinResourceObserver.toString()})(${JSON.stringify({ expectedImages })});(${installIntegratedStudyCaptureObserver.toString()})();(${installPreparationObserver.toString()})(${JSON.stringify({ modelPath, modelJson })});`,
  });
});
test.afterEach(async ({ page }, info) => {
  const report = reports.get(page);
  try {
    await step(
      readinessWindow(budgets.lifecycle),
      "settle exact bodies and final observations",
      async (remaining) => {
        report.bodies = await Promise.all(report.bodies);
        remaining();
        report.preparation = await page.evaluate(() =>
          (window as any).__r35Preparation?.snapshot(),
        );
        remaining();
        report.resources = await page.evaluate(() =>
          (window as any).__cabinResourceObserver?.snapshot(),
        );
        remaining();
        expect(
          report.bodies.every(
            (body: any) =>
              body.status === 200 &&
              body.bytes === bytes.length &&
              body.sha256 === anchors.candidateSha256,
          ),
        ).toBe(true);
        expect(
          report.diagnostics.filter(
            (row: any) =>
              row.kind === "pageerror" ||
              row.kind === "error" ||
              /shader error|INVALID_(ENUM|VALUE|OPERATION)|OUT_OF_MEMORY/i.test(
                row.message,
              ),
          ),
        ).toEqual([]);
      },
    );
  } catch (error) {
    report.finalObservationFailure = String(error);
    throw error;
  } finally {
    await step(
      readinessWindow(budgets.screenshot),
      "retain exact source and failure receipt",
      async () =>
        info.attach("source-and-native-proof", {
          body: JSON.stringify(report, null, 2),
          contentType: "application/json",
        }),
    );
  }
});
async function resources(page: Page, window: Window) {
  return step(
    window,
    "settle exact image identities and snapshot resources",
    async (remaining) => {
      await page.evaluate(() =>
        (window as any).__cabinResourceObserver.settleIdentities(),
      );
      remaining();
      return page.evaluate(() =>
        (window as any).__cabinResourceObserver.snapshot(),
      );
    },
  );
}
const observation = (page: Page, window: Window) =>
  step(window, "snapshot preparation", async () =>
    page.evaluate(() => (window as any).__r35Preparation.snapshot()),
  );
async function initial(page: Page) {
  const window = readinessWindow(budgets.initial);
  reports.get(page).initialWindow = window;
  await step(window, "initial navigation and ready UI", async (remaining) => {
    await page.goto("/configurator/premium?study=2008", {
      waitUntil: "domcontentloaded",
      timeout: remaining(),
    });
    await expect(page.locator("main")).toHaveAttribute(
      "data-cabin-preparation",
      "ready",
      { timeout: remaining() },
    );
    reports.get(page).uiReadyMs = performance.now() - window.startedAt;
    await expect(
      page.getByRole("heading", { name: "2008 GT-R R35 · Study" }),
    ).toBeVisible({ timeout: remaining() });
    await expect(page.locator(".scene-loading")).toHaveCount(0, {
      timeout: remaining(),
    });
    await expect(
      page.getByRole("button", { name: "Lights", exact: true }),
    ).toBeDisabled({ timeout: remaining() });
    await expect(
      page.getByRole("button", { name: "Ultimate Silver" }),
    ).toBeDisabled({ timeout: remaining() });
    expect(reports.get(page).modelRequests).toEqual([modelPath]);
    await armFunctionalCapture(page, { allowUnchanged: true });
  });
  return window;
}
async function capture(
  page: Page,
  info: TestInfo,
  label: string,
  seat: "driver" | "passenger" | null,
  window: Window,
) {
  await step(window, "exact native readiness", async (remaining) =>
    waitForFunctionalCapture(page, { preset: "hero", timeout: remaining() }),
  );
  if (label === "2008-source-exterior")
    reports.get(page).initialNativeReadyMs =
      performance.now() - reports.get(page).initialWindow.startedAt;
  return step(
    readinessWindow(budgets.screenshot),
    "screenshot, native verification, acceptance and attachment",
    async (remaining) => {
      const shot = await page.screenshot({
        timeout: remaining(),
        scale: "css",
      });
      remaining();
      const certificate = await verifyFunctionalCapture(page);
      remaining();
      expect(certificate.snapshot.vehicle).toMatchObject({
        url: modelPath,
        exterior: true,
        full: true,
        proxy: false,
        lamps: [],
        cabinSeat: seat,
      });
      if (seat)
        assertRestoredExteriorPose(
          certificate.snapshot.pose,
          expectedPose(seat, certificate.snapshot.dimensions),
        );
      const entry = { label, certificate, imageSha256: hash(shot) };
      remaining();
      await info.attach(label, { body: shot, contentType: "image/png" });
      remaining();
      reports.get(page).captures.push(entry);
      return certificate;
    },
  );
}
async function enter(page: Page, window: Window) {
  await step(window, "trusted interior entry", async (remaining) => {
    await page
      .getByRole("button", { name: "Camera", exact: true })
      .click({ timeout: remaining() });
    await armFunctionalCapture(page);
    remaining();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Interior", exact: true })
      .click({ timeout: remaining() });
    await expect(page.getByRole("dialog")).toHaveCount(0, {
      timeout: remaining(),
    });
  });
}
function assertInitialTimeline(observation: any, certificate: any) {
  expect(observation.issues).toEqual([]);
  const transition = observation.dom.find((row: any) => row.ready);
  expect(transition).toBeTruthy();
  const events = observation.events.filter(
    (event: any) => event.owner === certificate.owner,
  );
  const completed = (draw: any) =>
    events
      .filter(
        (event: any) => event.kind === "fence" && event.draws.includes(draw.id),
      )
      .flatMap((fence: any) =>
        events.filter(
          (event: any) =>
            event.kind === "wait" &&
            event.id === fence.id &&
            [0x911a, 0x911c].includes(event.status) &&
            event.at >= draw.at &&
            event.at <= transition.at,
        ),
      );
  const driver = events.find(
    (event: any) =>
      event.kind === "main" &&
      event.stable &&
      event.snapshot.camera?.preset === "interior" &&
      event.at < transition.at,
  );
  expect(driver).toBeTruthy();
  expect(driver.snapshot.vehicle).toMatchObject({
    exterior: true,
    full: true,
    proxy: false,
  });
  assertRestoredExteriorPose(
    driver.snapshot.pose,
    expectedPose("driver", driver.snapshot.dimensions),
  );
  expect(completed(driver).length).toBeGreaterThan(0);
  expect(
    events.some(
      (event: any) =>
        event.kind === "main" &&
        event.stable &&
        event.snapshot.camera?.preset === "hero" &&
        event.snapshot.vehicle.full &&
        event.at > completed(driver)[0].at &&
        completed(event).length > 0,
    ),
  ).toBe(true);
  for (const event of events.filter(
    (event: any) =>
      event.at < transition.at &&
      (event.kind === "buffer-replaced" ||
        (event.kind === "main" &&
          event.snapshot.camera?.preset === "interior")),
  ))
    expect(event.ui).toMatchObject({ maskCount: 1, maskOpaque: true });
  expect(observation.totals.fetches).toBe(1);
  expect(observation.totals.gltfParses).toBe(1);
}
async function retire(page: Page, cohort: any, owner: number) {
  const window = readinessWindow(budgets.lifecycle);
  await step(window, "complete trusted route retirement", async (remaining) => {
    await page
      .getByRole("button", { name: "Switch model", exact: true })
      .click({ timeout: remaining() });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^NISMO / })
      .click({ timeout: remaining() });
    await expect(page.locator(".scene-stage canvas")).toHaveCount(0, {
      timeout: remaining(),
    });
    await expect
      .poll(
        async () => {
          remaining();
          try {
            assertCabinResourcesReleased(cohort, await resources(page, window));
            const snapshot = await observation(page, window);
            const context = snapshot.contexts.find(
              (item: any) => item.owner === owner,
            );
            const owned = snapshot.resources.filter(
              (item: any) => item.contextId === context?.id,
            );
            remaining();
            return (
              owned.length > 0 &&
              owned.every((item: any) => item.deleted === 1 && item.deletedLive)
            );
          } catch (error) {
            remaining();
            return false;
          }
        },
        { timeout: remaining() },
      )
      .toBe(true);
    remaining();
  });
}
test("one exact preparation supports matching exterior, driver and passenger views with no refetch and clean retirement", async ({
  page,
}, info) => {
  const initialWindow = await initial(page);
  const exterior = await capture(
    page,
    info,
    "2008-source-exterior",
    null,
    initialWindow,
  );
  const inspect = readinessWindow(budgets.lifecycle);
  const preparation = await observation(page, inspect);
  assertInitialTimeline(preparation, exterior);
  remainingBudget(inspect);
  const cohort = cabinResourceCohort(
    { sequence: 0 },
    await resources(page, inspect),
    expectedImages,
  );
  expect(cohort.bitmapIds).toHaveLength(45);
  expect(cohort.decodedButNotUploaded).toEqual([]);
  remainingBudget(inspect);
  const driverWindow = readinessWindow(budgets.functional);
  await enter(page, driverWindow);
  const driver = await capture(
    page,
    info,
    "2008-source-driver",
    "driver",
    driverWindow,
  );
  const passengerWindow = readinessWindow(budgets.functional);
  await step(passengerWindow, "trusted passenger view", async (remaining) => {
    await armFunctionalCapture(page);
    remaining();
    await page
      .getByRole("button", { name: "Passenger", exact: true })
      .click({ timeout: remaining() });
  });
  await capture(
    page,
    info,
    "2008-source-passenger",
    "passenger",
    passengerWindow,
  );
  const returnWindow = readinessWindow(budgets.functional);
  await step(returnWindow, "trusted exterior return", async (remaining) => {
    await armFunctionalCapture(page);
    remaining();
    await page
      .getByRole("button", { name: "Back to exterior", exact: true })
      .click({ timeout: remaining() });
  });
  const restored = await capture(
    page,
    info,
    "2008-source-exterior-restored",
    null,
    returnWindow,
  );
  assertRestoredExteriorPose(restored.snapshot.pose, exterior.snapshot.pose);
  const repeatWindow = readinessWindow(budgets.functional);
  await enter(page, repeatWindow);
  const repeated = await capture(
    page,
    info,
    "2008-source-driver-repeat",
    "driver",
    repeatWindow,
  );
  expect(repeated.owner).toBe(driver.owner);
  const reviewWindow = readinessWindow(budgets.functional);
  await step(
    reviewWindow,
    "verify one preparation and honest metadata",
    async (remaining) => {
      const after = await observation(page, reviewWindow);
      assertResidentWorkUnchanged(preparation.totals, after.totals);
      expect(
        after.measures.filter(
          (row: any) => row.name === "gtr-cabin-resource-preparation",
        ),
      ).toHaveLength(1);
      expect(reports.get(page).modelRequests).toEqual([modelPath]);
      remaining();
      await page
        .getByRole("button", { name: "Model detail", exact: true })
        .click({ timeout: remaining() });
      await expect(page.getByRole("dialog")).toContainText(
        "2008 artist model · factory specifications unverified",
        { timeout: remaining() },
      );
      await expect(page.getByRole("dialog")).not.toContainText(
        "2024 US specification",
        { timeout: remaining() },
      );
      await expect(page.getByRole("dialog")).not.toContainText(
        "Published power",
        { timeout: remaining() },
      );
      await page.keyboard.press("Escape");
      remaining();
      await expect(page.getByRole("dialog")).toHaveCount(0, {
        timeout: remaining(),
      });
    },
  );
  await retire(page, cohort, exterior.owner);
});
test("native context loss closes old images and trusted retry creates one fresh owner", async ({
  page,
}, info) => {
  const initialWindow = await initial(page);
  const before = await capture(
    page,
    info,
    "before-native-context-loss",
    null,
    initialWindow,
  );
  const lossWindow = readinessWindow(budgets.lifecycle);
  const old = cabinResourceCohort(
    { sequence: 0 },
    await resources(page, lossWindow),
    expectedImages,
  );
  remainingBudget(lossWindow);
  await step(
    lossWindow,
    "native context loss and image closure",
    async (remaining) => {
      await page.locator(".scene-stage canvas").evaluate((canvas) => {
        const gl = (canvas as HTMLCanvasElement).getContext("webgl2"),
          extension = gl?.getExtension("WEBGL_lose_context");
        if (!extension)
          throw new Error("Native context-loss extension unavailable");
        extension.loseContext();
      });
      remaining();
      await expect(page.locator(".render-error")).toContainText(
        "graphics connection was lost",
        { timeout: remaining() },
      );
      await expect
        .poll(
          async () => {
            const snapshot = await resources(page, lossWindow);
            remaining();
            return snapshot.bitmaps
              .filter((bitmap: any) => old.bitmapIds.includes(bitmap.id))
              .every((bitmap: any) => bitmap.closeCalls === 1);
          },
          { timeout: remaining() },
        )
        .toBe(true);
    },
  );
  const retryWindow = readinessWindow(budgets.initial);
  const mark = await step(retryWindow, "mark fresh native owner", async () =>
    page.evaluate(() =>
      (window as any).__cabinResourceObserver.mark("trusted-retry"),
    ),
  );
  await step(retryWindow, "trusted context retry", async (remaining) => {
    await armFunctionalCapture(page, { replacement: true });
    remaining();
    await page
      .getByRole("button", { name: "Try again", exact: true })
      .click({ timeout: remaining() });
    await expect(page.locator("main")).toHaveAttribute(
      "data-cabin-preparation",
      "ready",
      { timeout: remaining() },
    );
  });
  const after = await capture(
    page,
    info,
    "after-native-context-retry",
    null,
    retryWindow,
  );
  expect(after.owner).not.toBe(before.owner);
  expect(reports.get(page).modelRequests).toEqual([modelPath, modelPath]);
  const inspect = readinessWindow(budgets.lifecycle);
  const fresh = cabinResourceCohort(
    mark,
    await resources(page, inspect),
    expectedImages,
  );
  remainingBudget(inspect);
  await retire(page, fresh, after.owner);
});
