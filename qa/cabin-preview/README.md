# Repaired cabin browser comparison

This separate preview is outside application routes and build inputs. It does not deploy a cabin to the live app. Candidate publication and later app integration require separate review.

## Exact inputs

- Combined repaired cabin: 14,216,316 bytes, SHA-256 c7d87646650c0cc6e825248052e02301c9fb8b03bb950f531d930238932a2ff1
- Stored lossless gzip: 7,452,031 bytes, SHA-256 2d7bb7111b0f8596fb9c91ecba8918649f1043ecc0a6ffca141c9d323c3b492b
- Retained accepted exterior: 8,296,356 bytes, SHA-256 fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d
- App adapter baseline: commit 276be604e8ff22afbeabecb42d6805187a7068cb

The 37 MB assembled review GLB is not needed. Preparation expands the exact cabin, reuses the exterior already in modeldata, copies pinned Three.js dependencies, and transpiles the current source material adapter with source-hash checks. It emits .qa-cabin-runtime for a runner-loopback server. It does not modify app source, public routes, Railway settings or source assets.

## Main-only CI and deployment boundary

The workflow listens only for main commits changing qa/cabin-preview/** or .github/workflows/cabin-webgl-qa.yml. Keep candidate changes inside those two namespaces. They are outside the currently verified 14 Railway watch patterns. Recheck that configuration and the complete changed-file list immediately before any publication. Railway does not wait for CI, so a commit marker or a pending check is not a deployment hold.

No new branch, release marker or deployment job is required for this preview.

## Prepared checks

Separate desktop and 390px mobile-viewport jobs use real Chromium WebGL through SwiftShader. They verify original texture decoding and both asset hashes, test camera input and exterior dolly endpoints, restore the exact four-window materials, exercise current paint/light behavior while protecting cabin materials, and test repeated switching and latest-load-wins behavior.

The three fixed eye positions are checked against every loaded triangle. The clear eye-centred sphere encloses the near-plane rectangle for every pan direction. Desktop captures include left, right, behind, up and down views. Both viewports capture front and rear lamps with paint fixed; paint changes are compared with lamps fixed.

Each camera has separate idle and panning samples. Reports preserve slow frame intervals, separate them from JavaScript render-submission time, include draw-call and triangle counts, and identify the renderer. Completion-fence wall time includes queued work and polling; it is reported separately from CPU submission time and is not a GPU timer measurement. GPU memory allocation and physical Android behavior are not measured. First-frame timing is first render submission, not proof of completed presentation.

Artifacts contain PNGs and JSON reports. Every screenshot begins as captured-unreviewed. A green workflow means functional checks passed; visual acceptance still requires inspecting the actual pixels. This candidate has 162 cabin render primitives and 487,240 triangles. This is a structural change from the original 515 primitives/446,480 triangles, not proof of a mobile performance release.

## Preparation checks

From a complete repository checkout:

    npm ci
    node scripts/prepare-models.mjs
    node qa/cabin-preview/prepare.mjs
    node --test qa/cabin-preview/test/*.test.mjs

The browser entry point is intended for the separately approved CI job. Its environment flag does not grant browser permission in another environment. The geometry-only Node exterior test omits image decoding; the CI browser stage must load and check all original images.

See PROVENANCE.md for attribution and model limits.

## Comparison and remaining limitations

reference-baseline.json preserves exact original-cabin input identity, capture hashes, camera poses, renderer counters and timing summaries from main commit 93d4fda63915c64ff1b3a8d852128fba667873f0. That run's original cabin SHA-256 is c1ae509893528c3b91e77417382fe7edbce10bc02e65243bf1149b80e884c5eb. The complete baseline remains in its original CI evidence; it is not rerendered for this comparison.

All planned candidate screenshots must use the same fixed camera, viewport, glass and appearance control states as that baseline. Candidate PNG hashes are recorded, not expected to match the old geometry/material pixels. Existing same-candidate restoration assertions remain unchanged. Isolated cabin draw submissions must be fewer than the measured baseline 515.

All visual evidence precedes timing. Cabin/interior timing cases run before the costly exterior transmission case, with the same 24 continuous samples and unchanged 90-second GPU completion limit. No timeout or render-quality setting is relaxed.

The original front-seat rearward occlusion and mobile exterior cropping are intentionally left visible by the unchanged camera contract. Fourteen known leak rays and 826 original glazing rays are checked separately from the rendered pixels. One known rear-deck corner ray is informational, not counted among the fourteen repaired fixtures. Passing selected rays does not establish that every body cavity is closed.
