/** CPU-only regression: no Playwright CLI, browser, server, or socket execution. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deriveQualityReadiness } from "../scripts/build-selectable-quality-drivers.mjs";
import {
  deriveIntegratedStudyCaptureObserverSource,
  installIntegratedStudyCaptureObserver,
} from "../scripts/integrated-study-readiness.mjs";

const adapterURL = new URL("../scripts/integrated-study-readiness.mjs", import.meta.url);
const helperURL = new URL("../scripts/cabin-preparation-readiness.generated.mjs", import.meta.url);
const helperBytes = readFileSync(helperURL);
const helperSource = String(helperBytes);
const detached = `expected.seat
        ? !vehicle.full || vehicle.proxy
        : vehicle.full || vehicle.proxy !== expected.proxy`;
const integrated = '!vehicle.full || vehicle.proxy || vehicle.url !== "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb"';
const nativeLamp = "vehicle.lamps.length > 0 &&";
const integratedLamp = "vehicle.lamps.length === 0 &&";

test("raw pinned derivation changes exactly the two reviewed study predicates", () => {
  assert.equal(
    helperSource,
    deriveQualityReadiness(readFileSync(new URL("../scripts/functional-capture-readiness.mjs", import.meta.url))),
  );
  const nativeObserver = helperSource.slice(
    helperSource.indexOf("export function installFunctionalCaptureObserver() {") + "export ".length,
    helperSource.indexOf("\nexport async function armFunctionalCapture("),
  ).trimEnd();
  const derived = deriveIntegratedStudyCaptureObserverSource(helperBytes);
  assert.equal(installIntegratedStudyCaptureObserver.toString(), derived);
  assert.equal(derived.split(integrated).length, 2);
  assert.equal(derived.split(integratedLamp).length, 2);
  assert.equal(
    derived.replace(integrated, detached).replace(integratedLamp, nativeLamp),
    nativeObserver,
    "Every native fence, state, dimension, deadline, and capture check stays byte-identical",
  );
});

test("source derivation fails closed on any preimage drift, including native gates", () => {
  const mutations = [
    helperSource + "\n",
    helperSource.replace(detached, "false"),
    helperSource.replace(nativeLamp, "true &&"),
    helperSource.replace("!draw.stable", "false"),
    helperSource.replace("[0x911a, 0x911c]", "[0x911a, 0x911c, 0x911b]"),
    helperSource.replace("if (now() >= deadline)", "if (false)"),
    helperSource.replace("[1_000_000, 2_000_000]", "[1_000_000, 2_000_000, 4_000_000]"),
  ];
  for (const mutated of mutations) {
    assert.notEqual(mutated, helperSource, "The regression must actually mutate source");
    assert.throws(
      () => deriveIntegratedStudyCaptureObserverSource(mutated),
      /Reviewed quality observer preimage must match exactly/,
    );
  }
});

test("the installed Playwright transformer imports the complete adapter without changing its derived observer", () => {
  const require = createRequire(import.meta.url);
  const transformerPath = require.resolve("playwright/lib/transform/babelBundle");
  // Node 24 is the exact CI runtime. Its synchronous load hook applies the
  // installed Playwright Babel transform to the real module graph, while raw
  // filesystem reads still see the reviewed bytes, just as in Playwright CI.
  // No Playwright loader, CLI, test runner, or browser is initialized.
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFileSync } from "node:fs";
    import { createRequire, registerHooks } from "node:module";
    import { fileURLToPath } from "node:url";
    const adapterURL = ${JSON.stringify(adapterURL.href)};
    const helperURL = ${JSON.stringify(helperURL.href)};
    const rootURL = new URL("../", adapterURL).href;
    const { babelTransform } = createRequire(adapterURL)(${JSON.stringify(transformerPath)});
    const transformed = new Set();
    const hook = registerHooks({
      load(url, context, nextLoad) {
        const loaded = nextLoad(url, context);
        if (!url.startsWith(rootURL) || !url.endsWith(".mjs")) return loaded;
        const result = babelTransform(String(loaded.source), fileURLToPath(url), true, []);
        assert.ok(result?.code, "Installed Playwright transformation must run");
        transformed.add(url);
        return { ...loaded, source: result.code };
      },
    });
    try {
      const adapter = await import(adapterURL);
      const helper = await import(helperURL);
      for (const url of [adapterURL, helperURL, new URL("./ui-optimization-policy.mjs", adapterURL).href])
        assert.ok(transformed.has(url), "Entire adapter module graph must be transformed: " + url);
      assert.equal(helper.installFunctionalCaptureObserver.toString().includes(${JSON.stringify(detached)}), false,
        "This exact installed transform must reproduce the old whitespace mismatch");
      const derived = adapter.deriveIntegratedStudyCaptureObserverSource(readFileSync(new URL(helperURL)));
      assert.equal(adapter.installIntegratedStudyCaptureObserver.toString(), derived);
      assert.equal(derived, ${JSON.stringify(deriveIntegratedStudyCaptureObserverSource(helperBytes))});
      for (const name of ["armFunctionalCapture", "waitForFunctionalCapture", "verifyFunctionalCapture"])
        assert.equal(adapter[name], helper[name], "Capture helpers remain the exact re-exports");
      console.log("Installed Playwright transform: complete adapter import and exact observer identity passed");
    } finally {
      hook.deregister();
    }
  `], { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 30_000 });
  assert.match(result, /complete adapter import and exact observer identity passed/);
});

test("actual E2E anchors, imports, and CPU loader survive the installed Playwright transform", () => {
  const require = createRequire(import.meta.url);
  const transformerPath = require.resolve("playwright/lib/transform/babelBundle");
  const { babelParse } = require(transformerPath);
  const e2eURL = new URL("../e2e/integrated-r35-study.spec.ts", import.meta.url);
  const source = readFileSync(e2eURL, "utf8");
  const body = babelParse(source, fileURLToPath(e2eURL), true).program.body;
  const one = (predicate, label) => {
    const matches = body.filter(predicate);
    assert.equal(matches.length, 1, `Exactly one actual E2E ${label}`);
    return source.slice(matches[0].start, matches[0].end);
  };
  const declaration = (name) => one(
    (node) => node.type === "VariableDeclaration" && node.declarations.some((value) => value.id.name === name),
    `${name} declaration`,
  );
  const imports = body.filter((node) => node.type === "ImportDeclaration");
  assert.equal(imports.filter((node) => node.source.value === "@playwright/test").length, 1);
  assert.equal(imports.some((node) => node.source.value.endsWith(".json")), false,
    "Camera anchors must use the reviewed native file read, not a bare JSON import");
  const anchorsDeclaration = declaration("anchors");
  const loaderRegistration = one(
    (node) => node.type === "ExpressionStatement" &&
      node.expression.type === "CallExpression" &&
      node.expression.callee.object?.name === "loader" &&
      node.expression.callee.property?.name === "register",
    "CPU loader registration",
  );
  // Run exact source slices, rather than a hand-written equivalent. Only test
  // registration and source/CI preflight are excluded from this CPU projection.
  // Every other actual static import is retained, including its dependency graph.
  const projection = [
    ...imports.filter((node) => node.source.value !== "@playwright/test")
      .map((node) => source.slice(node.start, node.end)),
    anchorsDeclaration,
    "export { anchors, Box3 };",
    // TypeScript's transform drops unused imports. Referencing their bindings
    // keeps the actual dependency imports in this narrowly scoped projection.
    `void [${imports.filter((node) => node.source.value !== "@playwright/test")
      .flatMap((node) => node.specifiers.map((specifier) => specifier.local.name)).join(", ")}];`,
    "export async function parseReviewedFixture(bytes) {",
    declaration("loader"),
    loaderRegistration,
    declaration("parsed"),
    "return parsed; }",
  ].join("\n");
  const relativeImports = imports.map((node) => node.source.value).filter((name) => name.startsWith("."));
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createHash } from "node:crypto";
    import { readFileSync } from "node:fs";
    import { createRequire, registerHooks } from "node:module";
    import { fileURLToPath } from "node:url";
    const e2eURL = ${JSON.stringify(e2eURL.href)};
    const rootURL = new URL("../", e2eURL).href;
    const loaderURL = new URL("../src/components/three/createVehicleLoader.ts", e2eURL).href;
    const { babelTransform } = createRequire(e2eURL)(${JSON.stringify(transformerPath)});
    const transformed = new Set();
    globalThis.fetch = () => { throw new Error("CPU collection regression must not fetch"); };
    const hook = registerHooks({
      resolve(specifier, context, nextResolve) {
        assert.notEqual(specifier, "@playwright/test", "CPU projection must not load the browser test runner");
        assert.equal(specifier.endsWith("/server.mjs"), false, "CPU projection must not load a server");
        // This is the spec's sole extensionless local import. Playwright resolves
        // it to the existing TypeScript file; no production source is rewritten.
        if (context.parentURL === e2eURL && specifier === "../src/components/three/createVehicleLoader")
          return nextResolve(loaderURL, context);
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url === e2eURL) {
          const result = babelTransform(${JSON.stringify(projection)}, fileURLToPath(url), true, []);
          assert.ok(result?.code);
          transformed.add(url);
          return { format: "module", source: result.code, shortCircuit: true };
        }
        const loaded = nextLoad(url, context);
        if (!url.startsWith(rootURL) || !/\\.(?:mjs|ts)$/.test(url)) return loaded;
        const result = babelTransform(String(loaded.source), fileURLToPath(url), true, []);
        assert.ok(result?.code);
        transformed.add(url);
        return { ...loaded, format: "module", source: result.code };
      },
    });
    try {
      const module = await import(e2eURL);
      for (const path of ${JSON.stringify(relativeImports)}) {
        const url = path.endsWith("createVehicleLoader") ? loaderURL : new URL(path, e2eURL).href;
        assert.ok(transformed.has(url), "Actual E2E dependency must be transformed and imported: " + url);
      }
      const anchors = JSON.parse(readFileSync(new URL("../src/data/r35-study-camera-anchors.json", e2eURL), "utf8"));
      assert.deepEqual(module.anchors, anchors, "Exact source JSON values must survive the native read");
      // CI prepares this exact model before this CPU test, while dist is built later.
      const bytes = readFileSync(new URL("../public/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb", e2eURL));
      assert.equal(bytes.length, 25_813_544);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), anchors.candidateSha256);
      const parsed = await module.parseReviewedFixture(bytes);
      let meshes = 0;
      parsed.scene.traverse((object) => { if (object.isMesh) meshes++; });
      assert.equal(meshes, 126);
      const bounds = new module.Box3().setFromObject(parsed.scene);
      for (const value of [...bounds.min.toArray(), ...bounds.max.toArray()]) assert.ok(Number.isFinite(value));
      assert.ok(bounds.max.x > bounds.min.x && bounds.max.y > bounds.min.y && bounds.max.z > bounds.min.z);
      console.log("Actual E2E anchors, dependency graph, and exact CPU loader parse passed");
    } finally {
      hook.deregister();
    }
  `], { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 30_000 });
  assert.match(result, /Actual E2E anchors, dependency graph, and exact CPU loader parse passed/);
});
