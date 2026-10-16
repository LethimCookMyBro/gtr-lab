/** QA-only exact-source reuse of the established same-session body recorder. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";

export const studyBodyRecorderSourceSha256 =
  "f3887aa2cb67b7082b0022d35cd66e06859e8034730c2ced38223cf5038de256";
export const studyBodyModel = Object.freeze({
  path: "/models/polytigr-r35-2008-precision-meshopt-rebuilt.glb",
  bytes: 25_813_544,
  sha256: "a8f6e3e15ab71075f8caf817d362d31be8b7f0f4734f12602ea6348599727585",
});
export function deriveIntegratedStudyBodyObserverSource(bytes) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    studyBodyRecorderSourceSha256, "Exact established runtime-body recorder preimage");
  const source = String(bytes);
  const start = "export async function observeCabinRuntimeBodies(";
  const end = "\nexport function resolveCabinTarget(";
  for (const boundary of [start, end])
    assert.equal(source.split(boundary).length, 2, "Unique reviewed body-recorder boundary");
  return source.slice(source.indexOf(start) + "export ".length, source.indexOf(end)).trimEnd();
}
const source = deriveIntegratedStudyBodyObserverSource(readFileSync(
  new NodeURL("./cabin-integration-policy.mjs", import.meta.url),
));
// The function body is unchanged. Only its closed model binding differs. These
// study cases finish transport before cancellation; no HTTP fault is excused.
const observe = new Function(
  "assert", "createHash", "cabinModels", "networkFaultHeader", "isExpectedCabinRequestFailure", "cabinPath", "proxyPath",
  `return (${source});`,
)(assert, createHash, Object.freeze([studyBodyModel]), "x-r35-cabin-qa-fault", () => false,
  studyBodyModel.path, "/models/r35-exterior-cabin-proxy-49d7c2ab.glb");

export function observeIntegratedStudyRuntimeBodies({ cdp, responses, errors, phase }) {
  return observe({ cdp, baseUrl: "https://gtr-lab-production.up.railway.app", responses, errors, phase }).then((observer) => ({
    async verify(pageResponses, failures) {
      await observer.verify(pageResponses, failures);
      assert.ok(responses.every((row) => row.status === 200 && row.injectedFault === undefined),
        "Study transport permits only exact successful responses without injected HTTP faults");
    },
  }));
}
