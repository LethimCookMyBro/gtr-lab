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
