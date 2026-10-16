import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateManifest, validateGlb } from "../scripts/prepare-models.mjs";
it("keeps study transport separate from the original two assets and pins all 99 exact chunks without generating them", async () => {
  const raw = await readFile("studydata/manifest.json").catch(() => null);
  expect(raw).not.toBeNull();
  const manifest = JSON.parse(raw);
  expect(validateManifest(manifest)).toHaveLength(1);
  const baseline = JSON.parse(await readFile("modeldata/manifest.json"));
  expect(baseline).toHaveLength(2);
  expect(baseline.some((x) => x.id === manifest[0].id)).toBe(false);
  const bytes = await readFile("public" + manifest[0].path),
    entry = manifest[0];
  expect(() => validateGlb(bytes, entry)).not.toThrow();
  expect(entry.chunks).toHaveLength(99);
  let offset = 0;
  for (const chunk of entry.chunks) {
    const part = bytes.subarray(offset, offset + chunk.bytes);
    expect(createHash("sha256").update(part).digest("hex")).toBe(chunk.sha256);
    offset += chunk.bytes;
  }
  expect(offset).toBe(bytes.length);
  expect(entry.chunks.at(-1).bytes).toBe(123432);
});
it("verifies the existing exact local candidate with the dedicated prepare adapter", async () => {
  const module = await import("../scripts/prepare-integrated-study.mjs").catch(
    () => ({}),
  );
  expect(module).toHaveProperty("prepareIntegratedStudy");
  const results = await module.prepareIntegratedStudy({ log() {} });
  expect(results).toHaveLength(1);
  expect(results[0].status).toBe("verified");
});

it("binds native QA to the exact reviewed main parent and first push attempt, rejecting target overrides", async () => {
  const module = await import("../scripts/integrated-study-readiness.mjs");
  expect(module).toHaveProperty("validateIntegratedStudyEnvironment");
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "LethimCookMyBro/gtr-lab",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "a".repeat(40),
    R35_INTEGRATED_STUDY_CI: "1",
    R35_INTEGRATED_STUDY_MESSAGE:
      "[stage-integrated-r35-study] bounded optional study",
  };
  expect(() => module.validateIntegratedStudyEnvironment(env)).not.toThrow();
  for (const change of [
    { GITHUB_ACTIONS: "false" },
    { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_REF: "refs/heads/other" },
    { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { GITHUB_RUN_ATTEMPT: "2" },
    { GITHUB_SHA: "unknown" },
    { R35_INTEGRATED_STUDY_MESSAGE: "[release-study]" },
    { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/tmp/chrome" },
    { R35_BASE_URL: "https://example.com" },
  ])
    expect(() =>
      module.validateIntegratedStudyEnvironment({ ...env, ...change }),
    ).toThrow();
  expect(module.STUDY_PARENT).toBe("271a674e9adf59e87d86b02fe63008ac5fb6eef6");
  expect(module.STUDY_RUNTIME_TREE).toBe(
    "2eeb020da40db1aaa6b6b44021578bbf85cb894e06682d0e381988b2ee1f9a5a",
  );
});
