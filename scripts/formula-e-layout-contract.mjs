/** CI-only catalog layout evidence. No production hooks or renderer changes. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationIdentity } from "./diagnose-dpr-motion.mjs";
import { createRuntimeBodyLedger } from "./cabin-runtime-body-ledger.mjs";

export const FORMULA_E_SOURCE_TREE =
  "f353b758035fcc65b88376a46b5cf7c5c3e14016c1769f052368070efbe7f5dc";
export const FORMULA_E_VIEWPORTS = Object.freeze([
  { name: "formula-e-desktop-1440", width: 1440, height: 900 },
  { name: "formula-e-mobile-320", width: 320, height: 844 },
  { name: "formula-e-mobile-390", width: 390, height: 844 },
]);
export function validateFormulaECI(env = process.env) {
  assert.equal(
    env.CI,
    "true",
    "Formula E browser/layout evidence runs only in CI",
  );
  assert.equal(env.GITHUB_ACTIONS, "true", "Use the authorized GitHub runner");
  assert.match(
    env.GITHUB_SHA ?? "",
    /^[a-f0-9]{40}$/,
    "Exact source/harness commit required",
  );
}
export function assertFormulaESource(identity) {
  assert.equal(
    identity?.sha256,
    FORMULA_E_SOURCE_TREE,
    "Unreviewed Formula E production source",
  );
  assert.equal(identity?.files?.length, 103, "Incomplete production identity");
}
const valid = (r) =>
  r &&
  [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
  r.width > 0 &&
  r.height > 0;
const inside = (child, parent) =>
  child.x >= parent.x - 1 &&
  child.y >= parent.y - 1 &&
  child.x + child.width <= parent.x + parent.width + 1 &&
  child.y + child.height <= parent.y + parent.height + 1;
const overlaps = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
export function assessNeutralLayout({
  viewport,
  frame,
  labels,
  obstacles = [],
}) {
  if (
    !valid(viewport) ||
    !valid(frame) ||
    !labels?.length ||
    ![...labels, ...obstacles].every(valid)
  )
    return ["Missing or invalid layout rectangles"];
  const failures = [];
  labels.forEach((label, index) => {
    if (!inside(label, viewport) || !inside(label, frame))
      failures.push(`Label ${index} is clipped`);
    if (obstacles.some((obstacle) => overlaps(label, obstacle)))
      failures.push(`Label ${index} overlaps a control or heading`);
    if (labels.slice(index + 1).some((other) => overlaps(label, other)))
      failures.push(`Label ${index} overlaps another label`);
  });
  return failures;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  validateFormulaECI();
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    process.env.GITHUB_SHA,
    "Checkout commit differs from the CI evidence identity",
  );
  const identity = await applicationIdentity(".");
  assertFormulaESource(identity);
  console.log(
    `Verified Formula E production source ${identity.sha256} (${identity.files.length} files)`,
  );
}
export const FORMULA_E_SCENE_OBSTACLES = Object.freeze([
  ".config-header",
  ".config-title",
  ".config-toolbar",
  ".scene-bottom",
]);

/** Observe exact Request objects; one original test window bounds all documents. */
export function createFormulaERuntimeEvidence(
  page,
  {
    intendedAssets,
    origin = "http://127.0.0.1:4173",
    window,
    now = () => performance.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  },
) {
  assert.ok(
    [
      "http://127.0.0.1:4173",
      "https://gtr-lab-production.up.railway.app",
    ].includes(origin),
    "Unreviewed Formula E evidence origin",
  );
  const live = origin === "https://gtr-lab-production.up.railway.app";
  const ledger = createRuntimeBodyLedger({
    intendedAssets,
    now,
    setTimer,
    clearTimer,
  });
  const requests = new WeakMap(),
    faults = [];
  let requestId = 0,
    generation = 0,
    completion,
    completionError;
  const snapshot = () => {
    const result = ledger.snapshot();
    return {
      ...result,
      origin,
      state: faults.length || completionError ? "failed" : result.state,
      observationWindow: window,
      observerErrors: faults.map((row) => ({ ...row })),
      ...(completionError ? { completionError: String(completionError) } : {}),
    };
  };
  const record = (event, error) => {
    faults.push({ event, error: String(error), at: now() });
  };
  const guard = (event, action) => {
    try {
      action();
    } catch (error) {
      record(event, error);
    }
  };
  const assetPath = (request) => {
    const url = new URL(request.url());
    if (
      live &&
      ["document", "script", "stylesheet"].includes(request.resourceType())
    ) {
      assert.equal(
        url.origin,
        origin,
        "Live document or bundle escaped the intended origin",
      );
      assert.equal(url.search, "", "Live runtime URL must not add a query");
      assert.equal(
        request.redirectedFrom(),
        null,
        "Live runtime request must not redirect",
      );
      if (request.resourceType() !== "document")
        assert.ok(
          intendedAssets.has(url.pathname),
          "Unpinned live script or stylesheet",
        );
    }
    if (url.origin !== origin) return null;
    if (request.resourceType() === "document") return "/index.html";
    return /^\/assets\/[^/]+\.(js|css)$/.test(url.pathname)
      ? url.pathname
      : null;
  };
  const onRequest = (request) =>
    guard("request", () => {
      const path = assetPath(request);
      if (!path) return;
      const identity = { requestId: ++requestId, generation };
      requests.set(request, identity);
      ledger.issue({
        ...identity,
        url: request.url(),
        path,
        phase: "Formula E layout",
        startedAt: now(),
      });
    });
  const onResponse = (response) =>
    guard("response", () => {
      const request = response.request();
      if (!assetPath(request)) return;
      const identity = requests.get(request);
      assert.ok(identity, "Runtime response has no observed issued Request");
      // Ledger records receiving before invoking body, and handles its rejection now.
      ledger
        .receive({
          ...identity,
          url: response.url(),
          status: response.status(),
          body: () => response.body(),
        })
        .catch((error) => record("unexpected-body-handler", error));
    });
  const onFailed = (request) =>
    guard("requestfailed", () => {
      if (!assetPath(request)) return;
      const identity = requests.get(request);
      assert.ok(identity, "Failed runtime request has no issued identity");
      ledger.fail({
        ...identity,
        error:
          request.failure()?.errorText ??
          "Request failed without an error description",
      });
    });
  const onPageError = (error) => record("pageerror", error);
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  page.on("pageerror", onPageError);
  const clean = () => {
    const result = snapshot();
    assert.equal(
      result.state,
      "finished",
      "Runtime evidence did not finish cleanly",
    );
    assert.deepEqual(
      result.observerErrors,
      [],
      "Runtime observer failures are retained",
    );
    for (const kind of ["html", "js", "css"])
      assert.ok(
        result.requests.some(
          (row) =>
            row.state === "body-completed" &&
            (kind === "html"
              ? row.path === "/index.html"
              : row.path.endsWith("." + kind)),
        ),
        `Missing completed ${kind} body`,
      );
    return result;
  };
  return Object.freeze({
    beginDocument() {
      ledger.beginDocument(++generation);
    },
    sealDocument() {
      return ledger.drainAndSeal({ generation, window });
    },
    finish() {
      completion ??= ledger
        .finish({ window })
        .then(clean)
        .catch((error) => {
          completionError = error;
          throw error;
        });
      return completion.then(clean);
    },
    snapshot,
    dispose() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
      page.off("pageerror", onPageError);
    },
  });
}
