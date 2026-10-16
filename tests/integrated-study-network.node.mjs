/** Same established recorder, exercised entirely with CPU event fixtures. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  deriveIntegratedStudyBodyObserverSource,
  observeIntegratedStudyRuntimeBodies,
  studyBodyModel,
} from "../scripts/integrated-study-network.mjs";

const bytes = readFileSync(new URL("../public" + studyBodyModel.path, import.meta.url));
const url = "http://127.0.0.1:4173" + studyBodyModel.path;
const bodyResult = (value = bytes) => ({ body: value.toString("base64"), base64Encoded: true });

async function fixture() {
  const cdp = new EventEmitter(), calls = [], responses = [], errors = [], pageResponses = [], failures = [];
  const bodies = new Map();
  let buffers, next = 0;
  cdp.send = async (method, params) => {
    calls.push({ method, params });
    if (method === "Network.enable") { buffers = params; return; }
    assert.equal(method, "Network.getResponseBody");
    assert.ok(bodies.has(params.requestId), "Only this session's native request can supply a body");
    const result = await bodies.get(params.requestId);
    if (result instanceof Error) throw result;
    assert.ok(result.body.length <= buffers.maxResourceBufferSize, "Encoded inspector content must fit the established buffer");
    return result;
  };
  const observer = await observeIntegratedStudyRuntimeBodies({ cdp, responses, errors, phase: () => "test" });
  const add = ({ body = bodyResult(), origin = "http://127.0.0.1:4173", status = 200, finish = true, fail, injectedFault } = {}) => {
    const id = ++next, nativeId = `native.${id}`, actualURL = origin + studyBodyModel.path;
    bodies.set(nativeId, body);
    pageResponses.push({ requestId: id, path: studyBodyModel.path, url: actualURL, status });
    cdp.emit("Network.responseReceived", { requestId: nativeId, response: { url: actualURL, status, headers: {
      "x-r35-cabin-qa-fault": injectedFault,
    } } });
    if (fail) {
      failures.push({ requestId: id, path: studyBodyModel.path, url: actualURL, failure: fail });
      cdp.emit("Network.loadingFailed", { requestId: nativeId, errorText: fail });
    } else if (finish) cdp.emit("Network.loadingFinished", { requestId: nativeId });
    return nativeId;
  };
  return { calls, responses, errors, pageResponses, failures, observer, add };
}

test("the whole historical preimage is pinned and its recorder function is byte-identical", () => {
  const source = readFileSync(new URL("../scripts/cabin-integration-policy.mjs", import.meta.url), "utf8");
  const expected = source.slice(source.indexOf("export async function observeCabinRuntimeBodies(") + 7,
    source.indexOf("\nexport function resolveCabinTarget(")).trimEnd();
  assert.equal(deriveIntegratedStudyBodyObserverSource(source), expected);
  for (const changed of [source + "\n", source.replace("64 * 1024 * 1024", "32 * 1024 * 1024"),
    source.replace("Network.getResponseBody", "Network.getResponseBody.changed")])
    assert.throws(() => deriveIntegratedStudyBodyObserverSource(changed), /Exact established runtime-body recorder preimage/);
});

test("64/256MiB same-session retention verifies both actual retry bodies separately", async () => {
  const f = await fixture();
  assert.ok(Math.ceil(bytes.length / 3) * 4 > 32 * 1024 * 1024);
  f.add(); f.add();
  await f.observer.verify(f.pageResponses, f.failures);
  assert.deepEqual(f.calls[0], { method: "Network.enable", params: {
    maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 256 * 1024 * 1024,
  } });
  assert.deepEqual(f.calls.slice(1).map((call) => call.params.requestId), ["native.1", "native.2"]);
  assert.deepEqual(f.responses.map(({ bytes, sha256 }) => ({ bytes, sha256 })), [
    { bytes: studyBodyModel.bytes, sha256: studyBodyModel.sha256 },
    { bytes: studyBodyModel.bytes, sha256: studyBodyModel.sha256 },
  ]);
});

test("verification waits for an already-issued native body read to finish", async () => {
  const f = await fixture();
  let finish;
  f.add({ body: new Promise((resolve) => { finish = resolve; }) });
  assert.equal(f.calls[1].method, "Network.getResponseBody", "Read starts at the native loadingFinished event");
  let completed = false;
  const verification = f.observer.verify(f.pageResponses, f.failures).then(() => { completed = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(completed, false);
  finish(bodyResult());
  await verification;
  assert.equal(completed, true);
});

for (const kind of ["wrong bytes", "truncated", "evicted", "wrong URL", "partial status"]) {
  test(`completed study response fails closed for ${kind}`, async () => {
    const f = await fixture();
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    const options = kind === "wrong URL" ? { origin: "https://unapproved.test" }
      : kind === "partial status" ? { status: 206 }
      : { body: kind === "evicted" ? new Error("Request content was evicted from inspector cache")
        : bodyResult(kind === "truncated" ? bytes.subarray(0, -1) : changed) };
    f.add(options);
    await assert.rejects(f.observer.verify(f.pageResponses, f.failures));
    assert.ok(f.errors.length > 0);
  });
}

test("missing native completion or unmatched Page response cannot borrow another request's proof", async () => {
  const f = await fixture(); f.add({ finish: false }); f.add();
  await assert.rejects(f.observer.verify(f.pageResponses, f.failures), /own exact body proof/);
  const other = await fixture(); other.add(); other.pageResponses.length = 0;
  await assert.rejects(other.observer.verify(other.pageResponses, other.failures), /same runtime responses/);
});

test("study decode/route cancellation does not authorize any HTTP failure", async () => {
  const f = await fixture(); f.add({ fail: "net::ERR_ABORTED" }); f.add();
  await assert.rejects(f.observer.verify(f.pageResponses, f.failures), /deliberately injected cabin faults/);
});

test("the study wrapper forbids historical marked404 exceptions even with a verified retry", async () => {
  const f = await fixture(); f.add({ status: 404, injectedFault: "missing" }); f.add();
  await assert.rejects(f.observer.verify(f.pageResponses, f.failures), /without injected HTTP faults/);
});

test("E2E keeps exact integrated decode-stage and phase-specific route assertions", () => {
  const source = readFileSync(new URL("../e2e/integrated-r35-study.spec.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /response\s*\.\s*body\s*\(/);
  assert.match(source, /phase: "idle", progressPhase: null, modelUrl: modelPath/);
  assert.match(source, /routeAway\(page, lifecycle, "idle"\)/);
  assert.match(source, /routeAway\(page, lifecycle, "loading"\)/);
  assert.match(source, /await bodyObservers\.get\(page\)\.verify\(report\.pageResponses, report\.requestFailures\)/);
});

function preparationHoldFixture() {
  const source = readFileSync(new URL("../e2e/integrated-r35-study.spec.ts", import.meta.url), "utf8");
  const { babelParse, babelTransform } = createRequire(import.meta.url)("playwright/lib/transform/babelBundle");
  const declarations = babelParse(source, "e2e/integrated-r35-study.spec.ts", true).program.body
    .filter((node) => node.type === "FunctionDeclaration" && node.id.name === "armPreparationCompletionHold");
  assert.equal(declarations.length, 1);
  const node = declarations[0], exact = source.slice(node.start, node.end);
  const transformed = babelTransform(exact, "e2e/integrated-r35-study.spec.ts", true, []).code;
  const attrs = new Map([
    ["data-cabin-layout", "integrated"], ["data-cabin-model-url", studyBodyModel.path],
    ["data-cabin-preparation", "idle"],
  ]), events = [], holds = [];
  const root = { isConnected: true, getAttribute: (name) => attrs.get(name) ?? null,
    hasAttribute: (name) => attrs.has(name) };
  let observer;
  class MutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target) { assert.equal(target, root); this.connected = true; events.push("observe"); }
    disconnect() { this.connected = false; events.push("disconnect"); }
  }
  const arm = runInNewContext(transformed + "\narmPreparationCompletionHold;", {
    document: { querySelector: () => root }, MutationObserver,
    __r35PreparationDecode: { release() { events.push("release"); assert.equal(holds.length, 0); } },
    __r35RenderBackpressureLifecycle: { armCurrent(label) {
      assert.equal(label, "completion-clear");
      assert.equal(attrs.get("data-cabin-preparation"), "loading");
      assert.equal(attrs.get("data-cabin-progress"), "preparing");
      const hold = { id: holds.length + 1 }; holds.push(hold); events.push("arm"); return hold;
    } },
  });
  const pending = arm(studyBodyModel.path);
  const mutate = (values) => {
    for (const [key, value] of Object.entries(values)) attrs.set(key, value);
    if (observer.connected) observer.callback();
  };
  return { pending, mutate, events, holds };
}

test("exact transformed hold armer waits for real preparation after releasing whole-car decode", async () => {
  const f = preparationHoldFixture();
  assert.deepEqual(f.events, ["observe", "release"]);
  f.mutate({ "data-cabin-preparation": "loading", "data-cabin-progress": "downloading" });
  assert.equal(f.holds.length, 0);
  f.mutate({ "data-cabin-progress": "preparing" });
  assert.deepEqual(await f.pending, { id: 1 });
  assert.deepEqual(f.events, ["observe", "release", "arm", "disconnect"]);
  f.mutate({ "data-cabin-progress": "preparing" });
  assert.equal(f.holds.length, 1);
});

test("preparation hold fails closed if readiness or a different study owner wins the race", async () => {
  for (const change of [
    { "data-cabin-preparation": "ready", "data-cabin-ready-at": "12" },
    { "data-cabin-model-url": "/models/other.glb" },
  ]) {
    const f = preparationHoldFixture(); f.mutate(change);
    await assert.rejects(f.pending, /missed the initial preparation boundary|owner changed/);
    assert.equal(f.holds.length, 0);
  }
});
