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
