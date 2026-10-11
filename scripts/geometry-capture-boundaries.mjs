import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  waitForExteriorCapture,
  readFunctionalCaptureFailure,
} from "./vehicle-preview-readiness.mjs";
import { verifyFunctionalCapture } from "./functional-capture-readiness.mjs";
export {
  installFunctionalCaptureObserver,
  armFunctionalCapture,
} from "./functional-capture-readiness.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const geometryReadinessTimeout = 15000;
export const geometryReadinessSources = Object.freeze(
  Object.fromEntries(
    ["functional-capture-readiness.mjs", "vehicle-preview-readiness.mjs"].map(
      (name) => [name, sha256(readFileSync(new URL(name, import.meta.url)))],
    ),
  ),
);

/** Replaces the existing 15s dimension gate at just canonical and Home.
 * The established consumer combines dimensions, selected state and native proof;
 * it neither invalidates nor renders, and owns no additional native poller. */
export async function waitForGeometryBoundary(page, environment) {
  await waitForExteriorCapture(page, {
    preset: "hero",
    environment,
    timeout: geometryReadinessTimeout,
  });
}

/** Reuse the one original screenshot for both exact hashing and retained evidence.
 * Verification rejects a changed draw/fence/state; there is no retry or repaint. */
export async function hashCompletedGeometryCanvas(page, info, name) {
  const pngPath = info.outputPath(`${name}-canvas.png`);
  const statePath = info.outputPath(`${name}-native.json`);
  const evidence = {
    version: 1,
    readinessTimeout: geometryReadinessTimeout,
    readinessSources: geometryReadinessSources,
    before: await readFunctionalCaptureFailure(page),
  };
  try {
    const bytes = await page.locator(".scene-stage canvas").screenshot();
    await writeFile(pngPath, bytes);
    await info.attach(`${name}-canvas`, {
      path: pngPath,
      contentType: "image/png",
    });
    evidence.pngSha256 = sha256(bytes);
    evidence.certificate = await verifyFunctionalCapture(page);
    return evidence.pngSha256;
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    evidence.after = await readFunctionalCaptureFailure(page);
    await writeFile(statePath, `${JSON.stringify(evidence, null, 2)}\n`);
    await info.attach(`${name}-native`, {
      path: statePath,
      contentType: "application/json",
    });
  }
}

/** Retain the live and latest submitted native state even if readiness fails
 * before either screenshot can begin. Diagnostic only; never repairs a failure. */
export async function retainGeometryReadinessState(page, info) {
  const path = info.outputPath("geometry-readiness-final.json");
  await writeFile(
    path,
    `${JSON.stringify({ readinessSources: geometryReadinessSources, state: await readFunctionalCaptureFailure(page) }, null, 2)}\n`,
  );
  await info.attach("geometry-readiness-final", {
    path,
    contentType: "application/json",
  });
}
