# Contained spatial cabin browser comparison

This separate preview is outside application routes and build inputs. It does not deploy a cabin to the live app. Candidate publication and later app integration require separate review.

## Sealed spatial candidate: six-view visual check

The separately named r35-sealed-spatial.glb.gz adds the repaired door/beltline/dashboard interfaces without replacing the two contained comparison assets below. Its GLB is 14,599,520 bytes, SHA-256 3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd; gzip is 7,774,439 bytes, SHA-256 171fb992e42632d75c87739441c71126e89de3223491a16dc6f0dbb93e1449db. It has 309 primitives, 509,692 triangles, 46 materials and no images or textures. Geometry source is 785cf1c4541df1d83fcc6c6a6a2e837deeb75f489a9b0241c70e07149ab8a070; finished source is b379c1f2f53f61967aa7bf72ba08927256a44f942a050e406d0b65419e9483ca.

Only the stage-cabin-sealed-visual commit marker selects the bounded sealed route. It captures four desktop views (driver-left, passenger-right, source-opaque front roof, source-opaque rear glass) and two mobile-size views (driver and rear). Existing fixed-camera contracts are unchanged. Transmission resolution stays at 1: the prior scale-0.5 diagnostic visibly softened through-window cabin details. There are no continuous timing blocks in this visual-only route and no physical-device performance claim.

Checks retain exact input identities, four-window/material isolation, fixed eye clearance, fourteen closure rays and 826 original window rays. An additional 96 deterministic seam rays, sampled across both sides from documented pre-repair failures, are checked in geometry and runtime-side modes. Tests must reproduce the failure on the retained 111457de model and pass on the sealed model. This bounded sample does not replace the author package's dense offline sweep or claim every possible cavity is closed.

Paint/lamp, window restoration and bounded fixed-eye controls are exercised in one synchronous mutation batch, then original appearance is restored before capture. This avoids a redundant GPU input queue; it does not relax capture completion or freshness checks. Six PNGs need actual review against the preserved baseline and contained-candidate evidence before any application integration.

The remaining sections describe the retained historical full comparison route, not extra coverage claimed by the sealed six-view run. The transmission diagnostic remains pinned to the older 111457de scene and the existing global control is not relabelled as a sealed-model control.

## Exact inputs

- Contained spatial cabin: 14,187,168 bytes, SHA-256 111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8
- Spatial lossless gzip: 7,532,332 bytes, SHA-256 02235501d454c343314d6fd9c0dc838b69989862d818d5a7d3ed4806938e515e
- Same-source global control: 14,216,128 bytes, SHA-256 f1e96e98d36d132d37b7419ea255205b1c9e0e2137ca6891311432a27b60fa9c
- Global-control gzip: 7,459,198 bytes, SHA-256 64fe1bb0fffa9cbbaacb90b972b2968f6716c5a6798ca95f5b46c1f0d50bacff
- Retained accepted exterior: 8,296,356 bytes, SHA-256 fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d
- App adapter baseline: commit 276be604e8ff22afbeabecb42d6805187a7068cb

The 37 MB assembled review GLB is not needed. Preparation expands the exact cabin, reuses the exterior already in modeldata, copies pinned Three.js dependencies, and transpiles the current source material adapter with source-hash checks. It emits .qa-cabin-runtime for a runner-loopback server. It does not modify app source, public routes, Railway settings or source assets.

## Main-only CI and deployment boundary

The workflow listens only for main commits changing qa/cabin-preview/** or .github/workflows/cabin-webgl-qa.yml. Keep candidate changes inside those two namespaces. They are outside the currently verified 14 Railway watch patterns. Recheck that configuration and the complete changed-file list immediately before any publication. Railway does not wait for CI, so a commit marker or a pending check is not a deployment hold.

No new branch, release marker or deployment job is required for this preview.

## Prepared checks

Separate desktop and 390px mobile-viewport jobs use real Chromium WebGL through SwiftShader. They verify original texture decoding and both asset hashes, test camera input and exterior dolly endpoints, restore the exact four-window materials, exercise current paint/light behavior while protecting cabin materials, and test repeated switching and latest-load-wins behavior.

The three fixed eye positions are checked against every loaded triangle. The clear eye-centred sphere encloses the near-plane rectangle for every pan direction. Desktop captures include left, right, behind, up and down views. Both viewports capture front and rear lamps with paint fixed; paint changes are compared with lamps fixed.

All original camera views retain their per-capture draw and triangle counters. Timing uses two same-source cases (isolated cabin and driver idle), each measured once for spatial and global grouping within the same browser/job. Reports preserve raw frame intervals, separate JavaScript render-submission time and completion wait, and identify the renderer. Completion-fence wall time includes queued work and polling; it is reported separately from CPU submission time and is not a GPU timer measurement. GPU memory allocation and physical Android behavior are not measured. First-frame timing is first render submission, not proof of completed presentation.

Artifacts contain PNGs and JSON reports. Every screenshot begins as captured-unreviewed. A green workflow means functional checks passed; visual acceptance still requires inspecting the actual pixels. The spatial candidate has 303 cabin render primitives; the matched global control has 162. Both have 487,228 identical source triangles and 46 identical material definitions. This is a structural change from the original 515 primitives/446,480 triangles, not proof of a mobile performance release.

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

All 51 spatial visual captures precede two matched global-control captures per viewport. Those control views reuse the isolated and driver cameras. All images precede timing. Four timing blocks follow: spatial isolated, global isolated, spatial driver idle, global driver idle. Each block uses 24 continuous submissions and the unchanged 90-second GPU completion/120-second sample deadlines. Spatial-first ordering preserves its result if the final global-driver case fails. The protocol is bounded, not counterbalanced or repeated, and does not claim physical Android performance. No timeout or render-quality setting is relaxed.

The original front-seat rearward occlusion and mobile exterior cropping are intentionally left visible by the unchanged camera contract. Fourteen known leak rays and 826 original glazing rays are checked separately from the rendered pixels. One known rear-deck corner ray is informational, not counted among the fourteen repaired fixtures. Passing selected rays does not establish that every body cavity is closed.

## Same-source pairing and containment

Both grouping variants were generated from finished source f69ea1e852811e0c2ca022c43e689d2e864904d02c7199b999ab66c751335781 and corrected geometry source bf38f51d0386e80b2fbbba9b7acda936aba0f5fbaf0ec183f5a96b646933af7f. The spatial policy uses 0.5 m cells, a 0.5 m maximum merged extent and 2,000 triangles per batch; oversized components remain independent. Materials, source geometry, lights, camera and renderer are held constant between the pair. Models reload into the same renderer with the same four-frame isolated/exterior warmup pose before each timing block; prior GPU work drains separately.

The containment correction targets the gray roof/rear-glass intrusion found in d4f992fb. Actual source-opaque exterior and red-paint captures must still be inspected against the original opaque baseline. Geometric source checks are not pixel acceptance. Original camera occlusion and mobile cropping intentionally remain unchanged for this comparison.

Camera label text and selected view are recorded and checked against capture metadata. The final spatial page reselects its fixed driver view after overlapping-load recovery. Actual label pixels still require review; DOM assertions alone do not prove compositor freshness.
