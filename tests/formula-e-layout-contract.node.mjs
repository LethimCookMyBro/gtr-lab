import test from "node:test";
import assert from "node:assert/strict";
import {
  assessNeutralLayout,
  assertFormulaESource,
  validateFormulaECI,
  FORMULA_E_SOURCE_TREE,
  FORMULA_E_VIEWPORTS,
} from "../scripts/formula-e-layout-contract.mjs";
const box = (x, y, width, height) => ({ x, y, width, height });
const sample = () => ({
  viewport: box(0, 0, 320, 844),
  frame: box(16, 100, 288, 330),
  labels: [box(40, 220, 230, 25), box(40, 257, 230, 36)],
  obstacles: [box(40, 124, 230, 50), box(90, 362, 170, 44)],
});
const identity = () => ({
  sha256: FORMULA_E_SOURCE_TREE,
  files: Array.from({ length: 103 }, (_, i) => ({
    path: `src/${i}`,
    sha256: "a".repeat(64),
  })),
});
const env = () => ({
  CI: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_SHA: "a".repeat(40),
});

test("pins exactly desktop 1440 and mobile 320/390 evidence", () => {
  assert.deepEqual(
    FORMULA_E_VIEWPORTS.map((v) => [v.width, v.height]),
    [
      [1440, 900],
      [320, 844],
      [390, 844],
    ],
  );
});
test("accepts a contained, separated neutral label layout", () => {
  assert.deepEqual(assessNeutralLayout(sample()), []);
});
for (const [name, mutate] of [
  [
    "viewport clipping",
    (s) => {
      s.labels[0].x = -4;
    },
  ],
  [
    "card clipping",
    (s) => {
      s.labels[0].y = 95;
    },
  ],
  [
    "overlapping labels",
    (s) => {
      s.labels[1].y = 230;
    },
  ],
  [
    "label hidden by heading",
    (s) => {
      s.obstacles[0].y = 220;
    },
  ],
  [
    "label hidden by CTA",
    (s) => {
      s.obstacles[1].y = 220;
    },
  ],
  [
    "empty text rectangle",
    (s) => {
      s.labels[0].height = 0;
    },
  ],
  [
    "non-finite rectangle",
    (s) => {
      s.labels[0].width = NaN;
    },
  ],
  [
    "missing label",
    (s) => {
      s.labels = [];
    },
  ],
])
  test(`rejects ${name}`, () => {
    const s = sample();
    mutate(s);
    assert.ok(assessNeutralLayout(s).length > 0);
  });
test("permits only the reviewed production identity", () => {
  assert.doesNotThrow(() => assertFormulaESource(identity()));
  assert.throws(() =>
    assertFormulaESource({ ...identity(), sha256: "b".repeat(64) }),
  );
  assert.throws(() => assertFormulaESource({ ...identity(), files: [] }));
});
test("allows source-bound GitHub CI execution", () => {
  assert.doesNotThrow(() => validateFormulaECI(env()));
});
for (const changed of [
  { CI: undefined },
  { GITHUB_ACTIONS: undefined },
  { GITHUB_SHA: "unknown" },
])
  test(`rejects incomplete CI authority ${JSON.stringify(changed)}`, () =>
    assert.throws(() => validateFormulaECI({ ...env(), ...changed })));
