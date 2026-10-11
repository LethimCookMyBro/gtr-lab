import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const integration = readFileSync(
  ".github/workflows/cabin-preview-integration.yml",
  "utf8",
);
const live = readFileSync(".github/workflows/cabin-preview-live.yml", "utf8");
const paths = (source) =>
  [
    ...source
      .slice(source.indexOf("    paths:"), source.indexOf("permissions:"))
      .matchAll(/^\s+- '([^']+)'$/gm),
  ].map((match) => match[1]);
const dependencies = [
  "scripts/functional-capture-readiness.mjs",
  "tests/functional-capture-readiness.test.mjs",
  "tests/functional-render-observation.test.ts",
  "tests/fixtures/functional-readiness-order-failure.json",
  "tests/fixtures/cabin-resource-main-failure.json",
  "tests/cabin-functional-workflow.node.mjs",
];
test("cabin staging is triggered by its functional helper and exact regression dependencies", () => {
  for (const path of dependencies)
    assert.ok(
      paths(integration).includes(path),
      `Missing functional dependency: ${path}`,
    );
  assert.match(
    integration,
    /contains\(github\.event\.head_commit\.message, '\[stage-cabin-integration\]'\)/,
  );
  assert.match(integration, /viewport: \[desktop, mobile\]/);
  assert.match(integration, /timeout-minutes: 25/);
});
test("the cabin job runs the functional regressions and workflow guard without test shorthand", () => {
  assert.match(
    integration,
    /node --check scripts\/functional-capture-readiness\.mjs/,
  );
  assert.match(
    integration,
    /node node_modules\/vitest\/vitest\.mjs run tests\/functional-capture-readiness\.test\.mjs tests\/functional-render-observation\.test\.ts --pool=threads --maxWorkers=1 --minWorkers=1/,
  );
  assert.match(
    integration,
    /node --test tests\/cabin-functional-workflow\.node\.mjs/,
  );
});
test("public cabin verification remains exclusively release-marker triggered", () => {
  assert.deepEqual(paths(live), [
    "release-cabin-preview-approved-20261007-1202.approved",
  ]);
  assert.match(
    live,
    /!contains\(github\.event\.head_commit\.message, '\[stage-cabin-integration\]'\)/,
  );
});

test("active cabin resource setup requires native driver readiness within the existing functional budget", () => {
  const source = readFileSync("scripts/capture-cabin-preview.mjs", "utf8");
  const entry = source.slice(
    source.indexOf("  const openCabin ="),
    source.indexOf("  const activeCabin ="),
  );
  const arm = entry.indexOf(
    "await armFunctionalCapture(page, { allowUnchanged: true })",
  );
  const click = entry.indexOf("await cameraButton.click()");
  assert.ok(arm >= 0 && click > arm);
  const active = source.slice(
    source.indexOf("  const activeCabin ="),
    source.indexOf("  const armFault ="),
  );
  assert.match(
    active,
    /await waitForFunctionalCapture\(page, \{ preset: 'interior', timeout: 20_000 \}\)/,
  );
  assert.ok(
    active.indexOf("await assertLayout()") <
      active.indexOf("await waitForFunctionalCapture"),
  );
  for (const label of [
    "second-entry-active",
    "route-exit-active",
    "context-loss-active",
  ]) {
    const target = source.indexOf(`await activeResources('${label}')`);
    const entry = source.lastIndexOf("await openCabin()", target);
    assert.ok(
      entry >= 0 && source.slice(entry, target).includes("await activeCabin()"),
      label,
    );
  }
  const resources = source.slice(
    source.indexOf("  const activeResources ="),
    source.indexOf("  const releasedResources ="),
  );
  assert.match(
    resources,
    /cabinResourceCohort\(cabinAttemptMark, snapshot, expectedImages\)/,
  );
  assert.doesNotMatch(resources, /catch|expect\.poll|timeout/);
});
