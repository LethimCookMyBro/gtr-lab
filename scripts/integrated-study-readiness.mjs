/** CI-only adaptation of the existing exact native-main observer. No browser/server side effects. */
import assert from "node:assert/strict";
import { installFunctionalCaptureObserver } from "./functional-capture-readiness.mjs";
export {
  armFunctionalCapture,
  waitForFunctionalCapture,
  verifyFunctionalCapture,
} from "./functional-capture-readiness.mjs";
const detached = `expected.seat
        ? !vehicle.full || vehicle.proxy
        : vehicle.full || vehicle.proxy !== expected.proxy`;
const lamp = "vehicle.lamps.length > 0 &&";
const source = installFunctionalCaptureObserver.toString();
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
export const installIntegratedStudyCaptureObserver = new Function(
  `return (${source
    .replace(
      detached,
      '!vehicle.full || vehicle.proxy || vehicle.url !== "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb"',
    )
    .replace(lamp, "vehicle.lamps.length === 0 &&")})`,
)();

import { execFileSync } from "node:child_process";
import { sourceIdentity } from "./ui-optimization-policy.mjs";
export const STUDY_PARENT = "648590901f82de578132c44a280fe1c6bb72845b";
export const STUDY_RUNTIME_TREE =
  "2eeb020da40db1aaa6b6b44021578bbf85cb894e06682d0e381988b2ee1f9a5a";
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
