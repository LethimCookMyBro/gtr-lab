/** Closed CI-only live adaptation. Pins come from accepted local builds, never HTTP. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationIdentity } from "./diagnose-dpr-motion.mjs";
import {
  FORMULA_E_SOURCE_TREE,
  assertFormulaESource,
  validateFormulaECI,
} from "./formula-e-layout-contract.mjs";
export const FORMULA_E_LIVE_ORIGIN =
  "https://gtr-lab-production.up.railway.app";
export const FORMULA_E_LIVE_REQUEST = "qa/formula-e-live-request.json";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) =>
  assert.deepEqual(
    Object.keys(value ?? {}).sort(),
    [...keys].sort(),
    "Unexpected live request fields",
  );
export function validateFormulaELiveCI(env = process.env) {
  validateFormulaECI(env);
  for (const [key, value] of Object.entries({
    GITHUB_REPOSITORY: "LethimCookMyBro/gtr-lab",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    FORMULA_E_LIVE: "1",
  }))
    assert.equal(env[key], value, key);
  assert.ok(
    env.FORMULA_E_LIVE_COMMIT_MESSAGE?.includes("[verify-formula-e-live]"),
    "Explicit live verification commit required",
  );
  for (const key of Object.keys(env).filter((key) =>
    key.startsWith("FORMULA_E_"),
  ))
    assert.ok(
      ["FORMULA_E_LIVE", "FORMULA_E_LIVE_COMMIT_MESSAGE"].includes(key),
      `Unreviewed override ${key}`,
    );
}
export function validateFormulaELiveRequest(request) {
  exactKeys(request, [
    "version",
    "allow",
    "origin",
    "expectedDeployedCommit",
    "railwayDeploymentId",
    "sourceTree",
    "sourceFiles",
    "buildSha256",
  ]);
  assert.equal(request.version, 1);
  assert.equal(
    request.allow,
    true,
    "Formula E live request is inactive pending accepted release pins",
  );
  assert.equal(request.origin, FORMULA_E_LIVE_ORIGIN, "Unreviewed live origin");
  assert.match(
    request.expectedDeployedCommit ?? "",
    /^[a-f0-9]{40}$/,
    "Frozen deployed commit required",
  );
  assert.match(
    request.railwayDeploymentId ?? "",
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
    "Separate Railway deployment readback required",
  );
  assert.equal(
    request.sourceTree,
    FORMULA_E_SOURCE_TREE,
    "Unreviewed live production source",
  );
  assert.equal(request.sourceFiles, 103);
  assert.match(
    request.buildSha256 ?? "",
    /^[a-f0-9]{64}$/,
    "Accepted candidate build identity required",
  );
  return Object.freeze({ ...request });
}
export function formulaEBuildIdentity(assets) {
  assert.ok(assets instanceof Map, "Expected exact local build asset Map");
  assert.ok(
    assets.size > 2 && assets.size <= 65,
    "Bounded HTML/JS/CSS build required",
  );
  const files = [...assets]
    .map(([path, pin]) => {
      assert.ok(
        path === "/index.html" ||
          /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(path),
        "Unsafe build asset path",
      );
      assert.ok(
        Number.isSafeInteger(pin?.bytes) &&
          pin.bytes > 0 &&
          pin.bytes <= 8 * 1024 * 1024,
        "Invalid build byte count",
      );
      assert.match(
        pin?.sha256 ?? "",
        /^[a-f0-9]{64}$/,
        "Invalid build asset hash",
      );
      return { path, bytes: pin.bytes, sha256: pin.sha256 };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  assert.ok(
    assets.has("/index.html") &&
      files.some((r) => r.path.endsWith(".js")) &&
      files.some((r) => r.path.endsWith(".css")),
    "Missing HTML/JS/CSS build pins",
  );
  assert.ok(
    files.reduce((sum, r) => sum + r.bytes, 0) <= 32 * 1024 * 1024,
    "Build exceeds total limit",
  );
  return { sha256: hash(JSON.stringify(files)), files };
}
export async function readFormulaEAssets(directory = "dist") {
  const paths = [
    "/index.html",
    ...(await readdir(resolve(directory, "assets")))
      .filter((name) => /\.(js|css)$/.test(name))
      .map((name) => "/assets/" + name),
  ];
  const pins = new Map();
  for (const path of paths) {
    assert.ok(
      path === "/index.html" ||
        /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(path),
      "Unsafe build filename",
    );
    const file = resolve(directory, "." + path),
      info = await lstat(file);
    assert.ok(
      info.isFile() && !info.isSymbolicLink(),
      "Regular build file required",
    );
    assert.ok(
      info.size > 0 && info.size <= 8 * 1024 * 1024,
      "Build file exceeds limit",
    );
    const bytes = await readFile(file);
    pins.set(path, { bytes: bytes.length, sha256: hash(bytes) });
  }
  formulaEBuildIdentity(pins);
  return pins;
}
export function assertFormulaELiveBuild(request, assets) {
  validateFormulaELiveRequest(request);
  const build = formulaEBuildIdentity(assets);
  assert.equal(
    build.sha256,
    request.buildSha256,
    "Build differs from the frozen accepted candidate identity",
  );
  return build;
}
export async function loadFormulaELiveRequest(env = process.env) {
  validateFormulaELiveCI(env);
  return validateFormulaELiveRequest(
    JSON.parse(await readFile(FORMULA_E_LIVE_REQUEST, "utf8")),
  );
}
export async function verifyFormulaELiveCheckout(env = process.env) {
  const request = await loadFormulaELiveRequest(env);
  const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  assert.equal(
    git(["rev-parse", "HEAD"]),
    env.GITHUB_SHA,
    "Harness checkout differs from CI commit",
  );
  assert.equal(
    git(["status", "--porcelain", "--untracked-files=no"]),
    "",
    "Tracked harness/runtime/target must stay clean",
  );
  git(["ls-files", "--error-unmatch", FORMULA_E_LIVE_REQUEST]);
  git(["merge-base", "--is-ancestor", request.expectedDeployedCommit, "HEAD"]);
  const source = await applicationIdentity(".");
  assertFormulaESource(source);
  return { request, harnessCommit: env.GITHUB_SHA, source };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "--build-identity") {
    // Source-only candidate evidence. This command never activates a live request.
    assertFormulaESource(await applicationIdentity("."));
    console.log(
      JSON.stringify(
        formulaEBuildIdentity(await readFormulaEAssets()),
        null,
        2,
      ),
    );
  } else {
    assert.equal(
      process.argv[2],
      "--check-checkout",
      "Explicit source/build check required",
    );
    console.log(JSON.stringify(await verifyFormulaELiveCheckout(), null, 2));
  }
}
