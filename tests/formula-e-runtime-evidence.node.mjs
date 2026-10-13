import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createFormulaERuntimeEvidence,
  FORMULA_E_SCENE_OBSTACLES,
} from "../scripts/formula-e-layout-contract.mjs";
import { readinessWindow } from "../scripts/cabin-preparation-policy.mjs";
const body = Buffer.from("reviewed bundle");
const pins = new Map(
  ["/index.html", "/assets/app.js", "/assets/app.css"].map((path) => [
    path,
    {
      bytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
    },
  ]),
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function setup() {
  const page = new EventEmitter();
  let time = 0,
    id = 0;
  const timers = new Map();
  const clock = {
    now: () => time,
    setTimer: (fn, delay) => {
      timers.set(++id, { fn, at: time + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  };
  const advance = (ms) => {
    time += ms;
    for (const [key, timer] of [...timers])
      if (timer.at <= time) {
        timers.delete(key);
        timer.fn();
      }
  };
  const evidence = createFormulaERuntimeEvidence(page, {
    intendedAssets: pins,
    window: readinessWindow(30_000, 0),
    ...clock,
  });
  evidence.beginDocument();
  const issue = (path = "/assets/app.js", type = "script") => {
    const request = {
      url: () => `http://127.0.0.1:4173${path}`,
      resourceType: () => type,
      failure: () => ({ errorText: "net::ERR_ABORTED" }),
    };
    page.emit("request", request);
    return request;
  };
  const receive = (request, value = body, status = 200) =>
    page.emit("response", {
      request: () => request,
      url: request.url,
      status: () => status,
      body: () => value,
    });
  const completeBaseline = async () => {
    receive(issue("/configurator/formula-e", "document"));
    receive(issue("/assets/app.js"));
    receive(issue("/assets/app.css", "stylesheet"));
    await flush();
  };
  return { page, evidence, advance, issue, receive, completeBaseline };
}
test("uses rendered desktop header children, never display:contents parent", () => {
  assert.deepEqual(FORMULA_E_SCENE_OBSTACLES, [
    ".config-header",
    ".config-title",
    ".config-toolbar",
    ".scene-bottom",
  ]);
  assert.match(
    readFileSync("src/styles.css", "utf8"),
    /\.config-information-header\s*\{\s*display: contents/,
  );
});
test("records issued request identity before any response, then pins exact HTML JS and CSS bodies", async () => {
  const h = setup();
  const req = h.issue();
  assert.equal(h.evidence.snapshot().requests[0]?.state, "issued");
  h.receive(req);
  await h.completeBaseline();
  const done = await h.evidence.finish();
  assert.equal(done.state, "finished");
  assert.equal(done.requests.length, 4);
  assert.ok(done.requests.every((r) => r.state === "body-completed"));
});
test("missing response reaches the original deadline and remains a failure", async () => {
  const h = setup();
  await h.completeBaseline();
  h.issue();
  const rejected = assert.rejects(h.evidence.finish(), /deadline/);
  h.advance(30_000);
  await rejected;
  assert.equal(h.evidence.snapshot().state, "failed");
  assert.ok(
    h.evidence
      .snapshot()
      .requests.some((r) => r.state === "error" && r.sha256 === undefined),
  );
});
test("response arriving during drain is included, without renewing the deadline", async () => {
  const h = setup();
  await h.completeBaseline();
  const req = h.issue();
  h.advance(29_990);
  const drain = h.evidence.finish();
  h.advance(5);
  const late = h.issue();
  h.receive(req);
  h.receive(late);
  const result = await drain;
  assert.equal(result.requests.length, 5);
  assert.equal(result.drains[0].readinessWindow.deadline, 30_000);
});
test("unresolved body expires and late success cannot turn its receipt into a pass", async () => {
  const h = setup();
  await h.completeBaseline();
  const req = h.issue(),
    d = deferred();
  h.receive(req, d.promise);
  const rejected = assert.rejects(h.evidence.finish(), /deadline/);
  h.advance(30_000);
  await rejected;
  const failed = h.evidence.snapshot().requests.at(-1);
  d.resolve(body);
  await flush();
  assert.equal(h.evidence.snapshot().requests.at(-1).state, "error");
  assert.equal(h.evidence.snapshot().requests.at(-1).error, failed.error);
  assert.equal(
    h.evidence.snapshot().lateEvents.at(-1).kind,
    "late-body-completed",
  );
});
test("body rejection is handled immediately and its raw error survives finalization", async () => {
  const h = setup();
  await h.completeBaseline();
  const req = h.issue();
  h.receive(req, Promise.reject(new Error("raw response body failure")));
  await flush();
  assert.match(
    h.evidence.snapshot().errors[0].error,
    /raw response body failure/,
  );
  await assert.rejects(h.evidence.finish());
});
for (const mutation of [
  "status",
  "hash",
  "requestfailed",
  "orphan",
  "pageerror",
])
  test(`${mutation} cannot produce a clean receipt`, async () => {
    const h = setup();
    await h.completeBaseline();
    const req =
      mutation === "orphan"
        ? {
            url: () => "http://127.0.0.1:4173/assets/app.js",
            resourceType: () => "script",
          }
        : h.issue();
    if (mutation === "requestfailed") h.page.emit("requestfailed", req);
    else if (mutation === "pageerror") {
      h.page.emit("pageerror", new Error("page failure"));
      h.receive(req);
    } else
      h.receive(
        req,
        mutation === "hash" ? Buffer.from("changed") : body,
        mutation === "status" ? 503 : 200,
      );
    await flush();
    await assert.rejects(h.evidence.finish());
    assert.equal(h.evidence.snapshot().state, "failed");
  });
test("hard navigation seals prior document and keeps one original deadline", async () => {
  const h = setup();
  await h.completeBaseline();
  await h.evidence.sealDocument();
  h.advance(15_000);
  h.evidence.beginDocument();
  await h.completeBaseline();
  const done = await h.evidence.finish();
  assert.deepEqual(
    done.generations.map((g) => g.state),
    ["sealed", "sealed"],
  );
  assert.ok(done.drains.every((d) => d.readinessWindow.deadline === 30_000));
});
test("late response after the deadline cannot rewrite the missing-response failure", async () => {
  const h = setup();
  await h.completeBaseline();
  const req = h.issue();
  const rejected = assert.rejects(h.evidence.finish());
  h.advance(30_000);
  await rejected;
  const original = h.evidence.snapshot().requests.at(-1).error;
  h.receive(req);
  await flush();
  assert.equal(h.evidence.snapshot().requests.at(-1).error, original);
  assert.ok(
    h.evidence
      .snapshot()
      .observerErrors.some((e) => /Late response/.test(e.error)),
  );
  await assert.rejects(h.evidence.finish());
});
test("late issued request invalidates an earlier success before observer disposal", async () => {
  const h = setup();
  await h.completeBaseline();
  await h.evidence.finish();
  h.issue();
  assert.equal(h.evidence.snapshot().state, "failed");
  await assert.rejects(h.evidence.finish());
});
test("missing CSS response evidence cannot pass a partial HTML/JS receipt", async () => {
  const h = setup();
  h.receive(h.issue("/configurator/formula-e", "document"));
  h.receive(h.issue());
  await flush();
  await assert.rejects(h.evidence.finish(), /Missing completed css/);
  assert.equal(h.evidence.snapshot().state, "failed");
});
test("actual E2E path uses rendered obstacles and always retains bounded ledger receipts", () => {
  const source = readFileSync("e2e/formula-e.spec.ts", "utf8");
  assert.match(source, /FORMULA_E_SCENE_OBSTACLES\.map/);
  assert.doesNotMatch(source, /page\.locator\("\.config-information-header"\)/);
  assert.match(source, /createFormulaERuntimeEvidence/);
  assert.match(source, /test\.afterEach/);
  assert.match(source, /evidence\.snapshot\(\)/);
  assert.match(source, /evidence\.sealDocument\(\)/);
  assert.doesNotMatch(source, /Promise\.all\(pending\)/);
});
