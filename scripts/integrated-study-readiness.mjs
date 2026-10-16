/** CI-only adaptation of the existing exact native-main observer. No browser/server side effects. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
export {
  armFunctionalCapture,
  waitForFunctionalCapture,
  verifyFunctionalCapture,
} from "./cabin-preparation-readiness.generated.mjs";
export function deriveIntegratedStudyCaptureObserverSource(bytes) {
  // Playwright transforms imported functions, including their whitespace. Read
  // and pin the reviewed source instead of adapting transformed Function.toString.
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "9a3b09e5592058214e65715edc8f3c7039acf335fd9210c5b4428142cac343c6",
    "Reviewed quality observer preimage must match exactly",
  );
  const moduleSource = String(bytes);
  const start = "export function installFunctionalCaptureObserver() {";
  const end = "\nexport async function armFunctionalCapture(";
  for (const boundary of [start, end])
    assert.equal(
      moduleSource.split(boundary).length,
      2,
      "Reviewed observer boundary must match exactly once",
    );
  const source = moduleSource
    .slice(moduleSource.indexOf(start) + "export ".length, moduleSource.indexOf(end))
    .trimEnd();
  const detached = `expected.seat
        ? !vehicle.full || vehicle.proxy
        : vehicle.full || vehicle.proxy !== expected.proxy`;
  const lamp = "vehicle.lamps.length > 0 &&";
  assert.equal(
    source.split(detached).length,
    2,
    "Reviewed detached representation predicate must match exactly once",
  );
  assert.equal(
    source.split(lamp).length,
    2,
    "Reviewed lamp predicate must match exactly once",
  );
  // Only the expected representation and empty authored-role contract differ.
  // Native-positive fences, exact states, quality, deadlines and capture checks are unchanged.
  return source
    .replace(
      detached,
      '!vehicle.full || vehicle.proxy || vehicle.url !== "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb"',
    )
    .replace(lamp, "vehicle.lamps.length === 0 &&");
}
export const installIntegratedStudyCaptureObserver = new Function(
  `return (${deriveIntegratedStudyCaptureObserverSource(
    readFileSync(new NodeURL("./cabin-preparation-readiness.generated.mjs", import.meta.url)),
  )})`,
)();

import { execFileSync } from "node:child_process";
import { sourceIdentity } from "./ui-optimization-policy.mjs";
export const STUDY_PARENT = "ec52935017233661f3c46a566ce4661eaa555783";
export const STUDY_RUNTIME_TREE =
  "a742f29926561f8c6b1e7256dc3c71d54ec10792ace219c5fbbeb330ad74310a";
export function validateIntegratedStudyEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.GITHUB_REPOSITORY, "LethimCookMyBro/gtr-lab");
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_EVENT_NAME, "push");
  assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
  assert.equal(env.R35_INTEGRATED_STUDY_CI, "1");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.ok(
    env.R35_INTEGRATED_STUDY_MESSAGE?.includes("[stage-integrated-r35-study]"),
  );
  assert.ok(!env.R35_INTEGRATED_STUDY_MESSAGE.includes("[release-"));
  for (const key of [
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
    "PLAYWRIGHT_BROWSERS_PATH",
    "R35_BASE_URL",
    "R35_MODEL_URL",
    "R35_APP_ROOT",
    "R35_CAPTURE_TIMEOUT",
    "R35_MAX_BUFFER_PIXELS",
  ])
    assert.equal(
      env[key],
      undefined,
      `No study target or browser override: ${key}`,
    );
}
export async function verifyIntegratedStudySource(root, env) {
  validateIntegratedStudyEnvironment(env);
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const parents = git("rev-list", "--parents", "-n", "1", "HEAD").split(" ");
  assert.deepEqual(
    parents,
    [env.GITHUB_SHA, STUDY_PARENT],
    "Only the exact approved main parent and one candidate commit are admitted",
  );
  const source = await sourceIdentity(root);
  assert.equal(
    source.sha256,
    STUDY_RUNTIME_TREE,
    "Exact reviewed production source digest",
  );
  assert.equal(
    git(
      "status",
      "--porcelain",
      "--",
      "src",
      "index.html",
      "package.json",
      "package-lock.json",
      "vite.config.ts",
      "server.mjs",
    ),
    "",
    "Native proof requires a clean reviewed production tree",
  );
  return { commit: env.GITHUB_SHA, parent: STUDY_PARENT, ...source };
}
