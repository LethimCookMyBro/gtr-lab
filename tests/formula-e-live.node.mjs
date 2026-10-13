import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FORMULA_E_LIVE_ORIGIN,
  formulaEBuildIdentity,
  readFormulaEAssets,
  validateFormulaELiveCI,
  validateFormulaELiveRequest,
  assertFormulaELiveBuild,
} from "../scripts/formula-e-live-contract.mjs";
import {
  FORMULA_E_SOURCE_TREE,
  createFormulaERuntimeEvidence,
} from "../scripts/formula-e-layout-contract.mjs";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const body = Buffer.from("accepted candidate bytes");
const assets = new Map(
  ["/index.html", "/assets/app.js", "/assets/app.css"].map((path) => [
    path,
    { bytes: body.length, sha256: hash(body) },
  ]),
);
const env = () => ({
  CI: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "LethimCookMyBro/gtr-lab",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "push",
  GITHUB_SHA: "b".repeat(40),
  FORMULA_E_LIVE: "1",
  FORMULA_E_LIVE_COMMIT_MESSAGE:
    "Verify approved catalog [verify-formula-e-live]",
});
const request = () => ({
  version: 1,
  allow: true,
  origin: FORMULA_E_LIVE_ORIGIN,
  expectedDeployedCommit: "a".repeat(40),
  railwayDeploymentId: "00000000-0000-4000-8000-000000000001",
  sourceTree: FORMULA_E_SOURCE_TREE,
  sourceFiles: 103,
  buildSha256: formulaEBuildIdentity(assets).sha256,
});

test("closed GitHub main-only live invocation has no origin or identity override", () => {
  assert.doesNotThrow(() => validateFormulaELiveCI(env()));
  for (const changed of [
    { CI: "false" },
    { GITHUB_ACTIONS: "false" },
    { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_REF: "refs/heads/topic" },
    { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { GITHUB_SHA: "main" },
    { FORMULA_E_LIVE: "0" },
    { FORMULA_E_LIVE_COMMIT_MESSAGE: "ordinary push" },
    { FORMULA_E_ORIGIN: FORMULA_E_LIVE_ORIGIN },
    { FORMULA_E_EXPECTED_BUILD: "a".repeat(64) },
  ]) {
    assert.throws(
      () => validateFormulaELiveCI({ ...env(), ...changed }),
      JSON.stringify(changed),
    );
  }
});
test("accepts frozen source/build and separately recorded deployment identity", () => {
  assert.doesNotThrow(() => validateFormulaELiveRequest(request()));
  assert.doesNotThrow(() => assertFormulaELiveBuild(request(), assets));
  assert.notEqual(env().GITHUB_SHA, request().expectedDeployedCommit);
});
for (const [name, changed] of Object.entries({
  inactive: { allow: false },
  absentCommit: { expectedDeployedCommit: null },
  branchCommit: { expectedDeployedCommit: "main" },
  absentBuild: { buildSha256: null },
  foreignOrigin: { origin: "https://example.com" },
  originPath: { origin: FORMULA_E_LIVE_ORIGIN + "/" },
  oldSource: { sourceTree: "0".repeat(64) },
  missingFiles: { sourceFiles: 102 },
  noDeployment: { railwayDeploymentId: null },
  unknownField: { acceptLiveHash: true },
})) {
  test(`rejects ${name} target`, () =>
    assert.throws(() =>
      validateFormulaELiveRequest({ ...request(), ...changed }),
    ));
}
test("checked-in request is either a closed inactive request or a fully pinned activation", async () => {
  const value = JSON.parse(
    await readFile("qa/formula-e-live-request.json", "utf8"),
  );
  if (value.allow === true) {
    validateFormulaELiveRequest(value);
    return;
  }
  assert.equal(value.allow, false);
  for (const field of [
    "expectedDeployedCommit",
    "railwayDeploymentId",
    "buildSha256",
  ])
    assert.equal(value[field], null);
  assert.throws(() => validateFormulaELiveRequest(value));
});
test("build identity is order-independent and includes every path, length and hash", () => {
  assert.deepEqual(
    formulaEBuildIdentity(new Map([...assets].reverse())),
    formulaEBuildIdentity(assets),
  );
  for (const mutated of [
    new Map([...assets].slice(1)),
    new Map([...assets, ["/assets/extra.js", assets.get("/assets/app.js")]]),
    new Map(
      [...assets].map(([p, pin]) => [p, { ...pin, bytes: pin.bytes + 1 }]),
    ),
    new Map(
      [...assets].map(([p, pin]) => [p, { ...pin, sha256: "0".repeat(64) }]),
    ),
  ]) {
    assert.throws(() => assertFormulaELiveBuild(request(), mutated));
  }
});
test("build identity rejects external, query, traversal and empty pins", () => {
  for (const path of [
    "https://example.com/a.js",
    "/assets/../app.js",
    "/assets/app.js?x=1",
    "/assets/sub/app.js",
  ])
    assert.throws(() =>
      formulaEBuildIdentity(
        new Map([...assets, [path, assets.get("/assets/app.js")]]),
      ),
    );
  for (const pin of [
    { bytes: 0, sha256: hash(body) },
    { bytes: 1, sha256: "unknown" },
  ])
    assert.throws(() =>
      formulaEBuildIdentity(new Map([...assets, ["/assets/extra.js", pin]])),
    );
});
test("reads expected pins only from local build bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "formula-e-build-"));
  try {
    await mkdir(join(directory, "assets"));
    for (const [path] of assets)
      await writeFile(join(directory, path.slice(1)), body);
    await writeFile(join(directory, "assets/ignored.woff2"), "font");
    assert.deepEqual(await readFormulaEAssets(directory), assets);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
function runtime(origin = FORMULA_E_LIVE_ORIGIN) {
  const page = new EventEmitter();
  const evidence = createFormulaERuntimeEvidence(page, {
    intendedAssets: assets,
    origin,
    window: {
      startedAt: 0,
      deadline: 30_000,
      budget: 30_000,
      clock: "node-performance",
    },
    now: () => 0,
  });
  evidence.beginDocument();
  const issue = (path, type = "script", requestOrigin = origin) => {
    const value = {
      url: () => requestOrigin + path,
      resourceType: () => type,
      redirectedFrom: () => null,
      failure: () => ({ errorText: "failure" }),
    };
    page.emit("request", value);
    page.emit("response", {
      request: () => value,
      url: value.url,
      status: () => 200,
      body: () => body,
    });
  };
  return {
    page,
    evidence,
    issue,
    async baseline() {
      issue("/configurator/formula-e", "document");
      issue("/assets/app.js");
      issue("/assets/app.css", "stylesheet");
      await Promise.resolve();
    },
  };
}
test("shared runtime collector supports exact live origin with same body ledger", async () => {
  const h = runtime();
  await h.baseline();
  const receipt = await h.evidence.finish();
  assert.equal(receipt.state, "finished");
  assert.equal(receipt.origin, FORMULA_E_LIVE_ORIGIN);
  assert.equal(receipt.observationWindow.budget, 30_000);
  assert.ok(
    receipt.requests.every(
      (r) =>
        r.url.startsWith(FORMULA_E_LIVE_ORIGIN + "/") &&
        r.sha256 === hash(body),
    ),
  );
  h.evidence.dispose();
});
for (const origin of ["https://example.com", "http://127.0.0.1:4173"])
  test(`live collector rejects escaped document/bundle origin ${origin}`, async () => {
    const h = runtime();
    await h.baseline();
    h.issue("/assets/escape.js", "script", origin);
    await assert.rejects(h.evidence.finish());
    assert.equal(h.evidence.snapshot().state, "failed");
    h.evidence.dispose();
  });
test("collector rejects unknown configurable origin before registering observers", () =>
  assert.throws(() => runtime("https://example.com")));
test("live config reuses six cases, blocks service workers, keeps 30 seconds and has no server", async () => {
  const source = await readFile("playwright.formula-e-live.config.ts", "utf8");
  assert.match(
    source,
    /import formulaE from "\.\/playwright\.formula-e\.config"/,
  );
  assert.match(source, /webServer: undefined/);
  assert.match(source, /timeout: 30_000/);
  assert.match(source, /retries: 0/);
  assert.match(source, /serviceWorkers: "block"/);
  const workflow = await readFile(
    ".github/workflows/formula-e-live.yml",
    "utf8",
  );
  assert.doesNotMatch(
    workflow,
    /workflow_dispatch|RAILWAY_TOKEN|wait-railway|railway up|npm start/,
  );
});

for (const [name, path, type] of [
  ["unknown same-origin script", "/assets/extra.js", "script"],
  ["script outside dist assets", "/extra.js", "script"],
  ["query alias", "/assets/app.js?x=1", "script"],
])
  test(`live collector rejects ${name}`, async () => {
    const h = runtime();
    await h.baseline();
    h.issue(path, type);
    await assert.rejects(h.evidence.finish());
    assert.equal(h.evidence.snapshot().state, "failed");
    h.evidence.dispose();
  });
