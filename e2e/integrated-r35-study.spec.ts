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
import * as preparationObservers from "../scripts/cabin-preparation-observer.mjs";
const { installPreparationObserver, installPreparationDecodeFixture } =
  preparationObservers;
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
  assertCurrentGeometry,
} = preparationPolicy;

// @ts-expect-error Existing absolute-window wrapper, with before/after checks and racing timeout.
import { boundedOperation } from "../scripts/cabin-preparation-checkpoint.mjs";
// @ts-expect-error Existing CI-only native-positive observation fixture.
import { installRenderBackpressureLifecycleFixture } from "../scripts/render-backpressure-lifecycle-fixture.mjs";
// @ts-expect-error Existing dependency-free native ownership assertions.
import { assertRetiredFenceContext } from "../scripts/diagnose-render-backpressure-lifecycle.mjs";
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
function expectedPose(seat: "driver" | "passenger" | "rear", dimensions: any) {
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
test.beforeEach(async ({ page }, info) => {
  const decodeGate = info.tags.includes("@decode-gate");
  const nativeLifecycle = info.tags.includes("@lifecycle");
  const quality = info.tags.includes("@reduced-quality")
    ? "reduced"
    : "standard";
  const reducedMotion = info.tags.includes("@reduced-motion")
    ? "reduce"
    : "no-preference";
  await page.emulateMedia({ reducedMotion });
  const report = {
    source: verifiedSource,
    quality,
    reducedMotion,
    fixtures: {
      decodeDeliveryHold: decodeGate,
      nativePositiveObservationHold: info.tags.includes("@gpu-cancel"),
    },
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
    content: `(${installCabinResourceObserver.toString()})(${JSON.stringify({ expectedImages })});${nativeLifecycle ? `(${installRenderBackpressureLifecycleFixture.toString()})();` : ""}(${installIntegratedStudyCaptureObserver.toString()})();(${installPreparationObserver.toString()})(${JSON.stringify({ modelPath, modelJson })});${decodeGate ? `(${installPreparationDecodeFixture.toString()})(${JSON.stringify({ images: expectedImages })});globalThis.__r35PreparationDecode.arm();` : ""}`,
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
        report.decodeFixture = await page.evaluate(() =>
          (window as any).__r35PreparationDecode?.snapshot(),
        );
        remaining();
        report.nativeFixture = await page.evaluate(() =>
          (window as any).__r35RenderBackpressureLifecycle?.snapshot(),
        );
        remaining();
        report.resources = await page.evaluate(() =>
          (window as any).__cabinResourceObserver?.snapshot(),
        );
        remaining();
        expect(report.bodies).toHaveLength(report.modelRequests.length);
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
    if (reports.get(page).quality === "reduced") {
      await page.waitForFunction(
        () => (window as any).__r35PreparationDecode?.snapshot().pending === 1,
        null,
        { timeout: remaining() },
      );
      await page
        .getByRole("button", { name: "Environment", exact: true })
        .click({ timeout: remaining() });
      const radio = page
        .getByRole("dialog")
        .locator('input[name="render-quality"][value="reduced"]');
      await radio.check({ timeout: remaining() });
      await expect(radio).toBeChecked({ timeout: remaining() });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close panel", exact: true })
        .click({ timeout: remaining() });
      await expect(page.getByRole("dialog")).toHaveCount(0, {
        timeout: remaining(),
      });
      const held = await observation(page, window);
      expect(held.ui.preparation.phase).toBe("loading");
      expect(held.ui.maskOpaque).toBe(true);
      remaining();
      await page.evaluate(() =>
        (window as any).__r35PreparationDecode.release(),
      );
    }
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
  seat: "driver" | "passenger" | "rear" | null,
  window: Window,
) {
  await step(window, "exact native readiness", async (remaining) =>
    waitForFunctionalCapture(page, {
      preset: "hero",
      quality: reports.get(page).quality,
      timeout: remaining(),
    }),
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
      const nativeDpr = await page.evaluate(() => devicePixelRatio);
      remaining();
      assertCurrentGeometry(
        certificate.snapshot,
        reports.get(page).quality,
        nativeDpr,
      );
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
test("[resident] one exact preparation supports matching exterior, driver, passenger and rear views with no refetch and clean retirement", async ({
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
  const rearWindow = readinessWindow(budgets.functional);
  await step(rearWindow, "trusted rear view", async (remaining) => {
    await armFunctionalCapture(page);
    remaining();
    await page
      .getByRole("button", { name: "Rear seat", exact: true })
      .click({ timeout: remaining() });
  });
  await capture(page, info, "2008-source-rear", "rear", rearWindow);
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
test("[resident] native context loss closes old images and trusted retry creates one fresh owner", async ({
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

for (const setting of [
  { name: "Reduced quality", tags: ["@reduced-quality", "@decode-gate"] },
  { name: "reduced motion", tags: ["@reduced-motion"] },
]) {
  test(
    `[settings] ${setting.name} preserves exact study views and resident re-entry`,
    { tag: setting.tags },
    async ({ page }, info) => {
      const initialWindow = await initial(page);
      const exterior = await capture(
        page,
        info,
        `${setting.name}-exterior`,
        null,
        initialWindow,
      );
      const inspect = readinessWindow(budgets.lifecycle);
      const before = await observation(page, inspect);
      assertInitialTimeline(before, exterior);
      const cohort = cabinResourceCohort(
        { sequence: 0 },
        await resources(page, inspect),
        expectedImages,
      );
      expect(cohort.bitmapIds).toHaveLength(45);
      expect(cohort.decodedButNotUploaded).toEqual([]);
      await step(
        inspect,
        "verify the requested motion preference",
        async () => {
          expect(
            await page.evaluate(
              () => matchMedia("(prefers-reduced-motion: reduce)").matches,
            ),
          ).toBe(reports.get(page).reducedMotion === "reduce");
        },
      );
      const driverWindow = readinessWindow(budgets.functional);
      await enter(page, driverWindow);
      const driver = await capture(
        page,
        info,
        `${setting.name}-driver`,
        "driver",
        driverWindow,
      );
      const rearWindow = readinessWindow(budgets.functional);
      await step(
        rearWindow,
        "trusted rear view under selected setting",
        async (remaining) => {
          await armFunctionalCapture(page);
          remaining();
          await page
            .getByRole("button", { name: "Rear seat", exact: true })
            .click({ timeout: remaining() });
        },
      );
      await capture(page, info, `${setting.name}-rear`, "rear", rearWindow);
      const returnWindow = readinessWindow(budgets.functional);
      await step(
        returnWindow,
        "trusted exterior return under selected setting",
        async (remaining) => {
          await armFunctionalCapture(page);
          remaining();
          await page
            .getByRole("button", { name: "Back to exterior", exact: true })
            .click({ timeout: remaining() });
        },
      );
      const restored = await capture(
        page,
        info,
        `${setting.name}-exterior-restored`,
        null,
        returnWindow,
      );
      assertRestoredExteriorPose(
        restored.snapshot.pose,
        exterior.snapshot.pose,
      );
      const repeatWindow = readinessWindow(budgets.functional);
      await enter(page, repeatWindow);
      const repeated = await capture(
        page,
        info,
        `${setting.name}-driver-repeat`,
        "driver",
        repeatWindow,
      );
      expect(repeated.owner).toBe(driver.owner);
      const review = readinessWindow(budgets.functional);
      await step(review, "verify setting-specific residency", async () => {
        const after = await observation(page, review);
        assertResidentWorkUnchanged(before.totals, after.totals);
        expect(
          after.measures.filter(
            (row: any) => row.name === "gtr-cabin-resource-preparation",
          ),
        ).toHaveLength(1);
        expect(reports.get(page).modelRequests).toEqual([modelPath]);
      });
      await retire(page, cohort, exterior.owner);
    },
  );
}

async function heldDecode(page: Page) {
  const window = readinessWindow(budgets.initial);
  reports.get(page).initialWindow = window;
  return step(
    window,
    "navigate to an exact native image decode-delivery hold",
    async (remaining) => {
      await page.goto("/configurator/premium?study=2008", {
        waitUntil: "domcontentloaded",
        timeout: remaining(),
      });
      await page.waitForFunction(
        () =>
          (globalThis as any).__r35PreparationDecode?.snapshot().pending === 1,
        null,
        { timeout: remaining() },
      );
      const fixture = await page.evaluate(() =>
        (globalThis as any).__r35PreparationDecode.snapshot(),
      );
      remaining();
      expect(fixture.records).toHaveLength(1);
      const held = fixture.records[0];
      expect(held.nativeCompletedAt).not.toBeNull();
      expect(held.releasedAt).toBeNull();
      expect(
        expectedImages.some(
          (image: any) =>
            image.sha256 === held.sourceSha256 &&
            image.bytes === held.sourceBytes,
        ),
      ).toBe(true);
      const state = await observation(page, window);
      expect(state.ui.preparation).toMatchObject({
        phase: "loading",
        progressPhase: "decoding",
      });
      expect(state.ui.maskOpaque).toBe(true);
      expect(state.dom.some((row: any) => row.ready)).toBe(false);
      const owner = state.events.find(
        (event: any) => event.kind === "attach",
      )?.owner;
      expect(owner).toEqual(expect.any(Number));
      reports.get(page).decodeBeforeCancellation = fixture;
      return { window, owner, held };
    },
  );
}

async function routeAway(page: Page, window: Window) {
  await step(
    window,
    "trusted route exit while initial preparation is incomplete",
    async (remaining) => {
      await page
        .getByRole("link", { name: "Back to models", exact: true })
        .click({ timeout: remaining() });
      await expect(page).toHaveURL(/\/models$/, { timeout: remaining() });
      await expect(page.locator(".scene-stage canvas")).toHaveCount(0, {
        timeout: remaining(),
      });
      const state = await observation(page, window);
      const click = state.clicks.findLast(
        (row: any) => row.label === "Back to models",
      );
      expect(click).toMatchObject({
        trusted: true,
        ui: { preparation: { phase: "loading" } },
      });
    },
  );
}

async function cancelledOwnerReleased(
  page: Page,
  owner: number,
  window: Window,
) {
  await step(
    window,
    "settle the exact cancelled owner's late images and native resources",
    async (remaining) => {
      await expect
        .poll(
          async () => {
            try {
              const snapshot = await resources(page, window);
              const bitmaps = expectedImages.map((image: any) => {
                const matches = snapshot.bitmaps.filter(
                  (bitmap: any) => bitmap.sourceSha256 === image.sha256,
                );
                expect(matches).toHaveLength(1);
                return matches[0];
              });
              expect(bitmaps).toHaveLength(45);
              const cohort = {
                bitmapIds: bitmaps.map((bitmap: any) => bitmap.id),
                textureIds: [],
              };
              assertCabinResourcesReleased(cohort, snapshot);
              const preparation = await observation(page, window);
              expect(preparation.issues).toEqual([]);
              const context = preparation.contexts.find(
                (row: any) => row.owner === owner,
              );
              expect(context).toMatchObject({ connected: false });
              const owned = preparation.resources.filter(
                (row: any) => row.contextId === context.id,
              );
              if (reports.get(page).fixtures.nativePositiveObservationHold)
                expect(owned.length).toBeGreaterThan(0);
              expect(
                owned.every((row: any) => row.deleted === 1 && row.deletedLive),
              ).toBe(true);
              expect(preparation.totals.fetches).toBe(1);
              expect(preparation.totals.gltfParses).toBe(1);
              expect(preparation.ui.cabinRail).toBe(false);
              expect(
                preparation.dom.some(
                  (row: any) => row.pathname === "/models" && row.ready,
                ),
              ).toBe(false);
              expect(
                preparation.events.some(
                  (row: any) =>
                    row.kind === "main" &&
                    row.ui.pathname === "/models" &&
                    row.snapshot?.vehicle?.url === modelPath,
                ),
              ).toBe(false);
              const native = await page.evaluate(() =>
                (globalThis as any).__r35RenderBackpressureLifecycle.snapshot(),
              );
              remaining();
              const sceneContexts = native.contexts.filter(
                (row: any) => row.sceneOwner,
              );
              expect(sceneContexts).toHaveLength(1);
              const retirement = assertRetiredFenceContext(
                native,
                sceneContexts[0].id,
              );
              reports.get(page).cancelledOwner = {
                owner,
                bitmapIds: cohort.bitmapIds,
                nativeResourceIds: owned.map((row: any) => row.id),
                retirement,
              };
              return true;
            } catch (error) {
              remaining();
              return false;
            }
          },
          { timeout: remaining() },
        )
        .toBe(true);
      expect(reports.get(page).modelRequests).toEqual([modelPath]);
    },
  );
}

test(
  "[cancellation] trusted route exit during native decode delivery closes the exact late image",
  { tag: ["@decode-gate", "@lifecycle"] },
  async ({ page }) => {
    const { owner, held } = await heldDecode(page);
    const lifecycle = readinessWindow(budgets.lifecycle);
    await routeAway(page, lifecycle);
    await step(
      lifecycle,
      "release the genuine native bitmap to its cancelled owner",
      async () => {
        await page.evaluate(() =>
          (globalThis as any).__r35PreparationDecode.release(),
        );
      },
    );
    await cancelledOwnerReleased(page, owner, lifecycle);
    await step(
      lifecycle,
      "verify exact held-bitmap closure after cancellation",
      async () => {
        const fixture = await page.evaluate(() =>
          (globalThis as any).__r35PreparationDecode.snapshot(),
        );
        expect(fixture.pending).toBe(0);
        expect(fixture.records).toHaveLength(1);
        const after = fixture.records[0];
        expect(after.bitmapIdentity).toBe(held.bitmapIdentity);
        expect(after.sourceSha256).toBe(held.sourceSha256);
        expect(after.closeCalls).toBe(1);
        expect(after.releasedAt).toBeGreaterThanOrEqual(
          after.nativeCompletedAt,
        );
        expect(after.closedAt).toBeGreaterThanOrEqual(after.releasedAt);
      },
    );
  },
);

test(
  "[cancellation] trusted route exit during native-positive preparation retires its outstanding queue",
  { tag: ["@decode-gate", "@lifecycle", "@gpu-cancel"] },
  async ({ page }) => {
    const { window, owner } = await heldDecode(page);
    const hold = await step(
      window,
      "arm the existing first-owner native-positive observation fixture",
      async () => {
        const hold = await page.evaluate(() =>
          (globalThis as any).__r35RenderBackpressureLifecycle.armCurrent(
            "completion-clear",
          ),
        );
        await page.evaluate(() =>
          (globalThis as any).__r35PreparationDecode.release(),
        );
        return hold;
      },
    );
    await step(
      window,
      "observe an actual positive native fence while preparation remains masked",
      async (remaining) => {
        await page.waitForFunction(
          (id) => {
            const f = (
              globalThis as any
            ).__r35RenderBackpressureLifecycle.snapshot();
            const p = (globalThis as any).__r35Preparation.status();
            return (
              f.holds.find((row: any) => row.id === id)?.substitutions > 0 &&
              p.ui.preparation?.progressPhase === "preparing"
            );
          },
          hold.id,
          { timeout: remaining() },
        );
        const state = await observation(page, window);
        expect(state.ui.preparation.phase).toBe("loading");
        expect(state.ui.maskOpaque).toBe(true);
        expect(state.dom.some((row: any) => row.ready)).toBe(false);
        const fixture = await page.evaluate(() =>
          (globalThis as any).__r35RenderBackpressureLifecycle.snapshot(),
        );
        remaining();
        expect(
          fixture.fences.some(
            (row: any) =>
              row.contextId === hold.contextId && row.deletedSequence === null,
          ),
        ).toBe(true);
        reports.get(page).preparationCancellation = {
          hold,
          state: state.current,
          fixture,
        };
      },
    );
    const lifecycle = readinessWindow(budgets.lifecycle);
    await routeAway(page, lifecycle);
    await step(
      lifecycle,
      "release only the positive-observation delay after trusted route cancellation",
      async () => {
        await page.evaluate(() =>
          (
            globalThis as any
          ).__r35RenderBackpressureLifecycle.releaseCompletion(),
        );
      },
    );
    await cancelledOwnerReleased(page, owner, lifecycle);
  },
);
