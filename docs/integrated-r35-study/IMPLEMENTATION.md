# Private optional 2008 R35 whole-car study

Status: source/CPU integration candidate only. No public publication, browser render, GPU performance measurement or visual acceptance is represented by this package.

## Scope and identity

- Based on the source files of live runtime `14668a99`, recovered at `home-repair-recovery-20261014b/app`. The current `6485909` checkout adds seven unrelated video-probe QA files; this patch touches none of them and changes no homepage runtime file.
- Premium remains the default. Its Ciasny exterior and original authored detached cabin are unchanged. All five other catalog entries are unchanged.
- The optional `2008 R35 study` choice appears in Premium's existing Switch model drawer. The private route is `/configurator/premium?study=2008`; the query is ignored for other catalog models. Selecting the ordinary Premium card clears the study choice.
- This is PolyTigr's artist model titled “Nissan GT-R 2008 red,” formerly credited to TGRRRR, under CC BY 4.0. It is not a NISMO or T-spec, not official factory geometry and not a verified trim replica. Its details contain no later Premium specifications or unsupported performance numbers.
- Exact candidate: `polytigr-r35-2008-precision-meshopt-rebuilt.glb`, 25,813,544 bytes, SHA-256 `a8f6e3e15ab71075f8caf817d362d31be8b7f0f4734f12602ea6348599727585`.

## Runtime boundary

`AssetManifest.cabinLayout` explicitly distinguishes the existing detached layout from the integrated layout. The integrated model has empty dynamic paint/headlight/taillight roles. It uses a single `useVehicleAsset` request and the original GLTFLoader scene, with an idempotent owner for its geometry, materials, textures and bitmaps. Source parser associations are recorded in `userData.gltfSource`; generated generic mesh names are never used to guess roles. The existing normalized vehicle mount applies one transform to the complete source scene.

Integrated selection suppresses both the detached cabin URL and the exterior proxy URL. It bypasses `CabinAttachment`, source-window replacement, cabin layers, render-order changes and blanket shadow mutations. The same whole-car scene remains mounted when entering, switching seats, exiting and re-entering. The existing owner's aborted decode/error/route cleanup applies to this same scene; the Canvas disposal set deduplicates aliases of that owner.

`createCabinPreparationSteps` has one optional explicit integrated mode. It uses the existing bounded batches and native admission owner, compiles source materials, uploads unique textures once and warms bounded geometry without reparenting the mounted model. Temporary visibility, culling and renderer draw state are restored even after exceptions. Authored layers, shadow flags, materials and transforms remain unchanged. Detached mode retains its existing behavior.

`CabinRuntime` still waits for exact completed native main driver and exterior-return presentations before `onCabinReady`. Its integrated stamp requires the same object to serve the exterior and cabin roles, attached to the exact scene throughout; no proxy can satisfy the stamp. Source-backed driver/passenger/rear inspection anchors are transformed with the loaded asset's normalization exactly once. These are qualified inspection starting points, not factory measurements or collision-safe volumes.

The initial study preparation reports “preparing,” not a second cabin download. Entry/exit do not increment the preparation request or reload the GLB. Existing deadlines, quality caps, batching sizes, pacing and native-completion behavior are untouched.

## Verification boundary

The preserved checks are in the parent package's `checks/` directory. CPU tests exercise synthetic mounted preparation and the exact pinned GLB with inert image-bitmaps, not a GPU. Image stubs permit lifetime assertions only; they do not establish image decode performance, color accuracy or visual quality.

The full safe Vitest command excludes only `tests/server.test.mjs`, which opens real listeners. No local server, browser, Playwright run, WebGL context or network listener was started. Tests that inspect browser driver contracts run as ordinary CPU mocks/AST checks, not browser execution.

The explicit TypeScript and Vite bundle commands do not invoke `npm run build` or `prepare:assets`, avoiding unapproved asset downloads. The bundle check verifies code compilation and includes the locally supplied study asset; it does not prove all baseline runtime assets have been reconstructed. Existing Ciasny/cabin/environment asset preparation remains the baseline's workflow.

## Required CI and visual acceptance before release

Use the existing permitted CI/browser environment after publication scope is approved. Verify the optional route separately from the unchanged Premium default: initial exterior, exact driver preparation and restored exterior, driver/passenger/rear views, drag limits, repeated entry/exit, model switch/back, route exit during decode/preparation, resource teardown, Standard/Reduced quality, responsive layouts and reduced motion. Preserve original failures and source-identify screenshots. Inspect source glass, seat/roof clipping (rear roof was a prior concern), lighting/material appearance and ground contact. No claim of readiness or premium realism follows from these CPU checks alone.

## Private packaging and later publication

The source patch and changed-source archive exclude all browser screenshots/traces and build outputs. The GLB is a separate existing candidate input, not a new conversion. Frozen role, camera, texture and precision manifests are included for audit. The role map and texture-memory estimate are source evidence and analytical estimates, not measured GPU residency.

No binary chunk, gzip derivative, public upload or deployment was generated here. `studydata/manifest.json` records all 99 future chunk hashes without duplicating the GLB. The separate `prepare-integrated-study.mjs` adapter delegates to the existing validated assembler and is wired into build-time asset preparation. It verifies the already supplied private local GLB; a clean checkout requires the separately approved 99 chunks before it can build. The original two-entry modeldata manifest and its fixture counts remain unchanged.

The CI-only staged-push workflow `integrated-r35-study.yml` builds the exact checked-out revision, validates the study hash, and runs two bounded cases on desktop 1440×900 and phone 390×844. Existing initial/functional/lifecycle/screenshot limits remain 90/20/30/45 seconds. It uses the existing native-main and resource observers with only a source-specific integrated/empty-role matching predicate. It saves exterior, driver, passenger, restored exterior and repeated-driver images; verifies exact source-backed poses, one initial model fetch/parse/preparation and stable upload counters; checks normal retirement; and separately injects native context loss followed by a trusted retry and retirement. The configuration refuses execution outside the exact repository/main push, first run attempt, `[stage-integrated-r35-study]` token, and direct parent `648590901f82de578132c44a280fe1c6bb72845b`. It validates the clean production source digest `2eeb020da40db1aaa6b6b44021578bbf85cb894e06682d0e381988b2ee1f9a5a` before setup and browser creation, and rejects browser/target overrides. Existing absolute-window wrappers cover native readiness, full screenshot/verification/attachment, and complete cleanup transactions, including post-completion deadline checks. No browser portion has run here.

The exact proposed public path list is `PUBLICATION-MANIFEST.json` in the private parent package: 41 materialized source/test/CI/docs/legal files plus 99 proposed binary chunks, 140 repository paths total. Publication and the actual CI run remain approval-gated. The runtime output adds one self-contained GLB and two legal text files. No raw duplicate model is proposed for Git, and no browser evidence belongs in source.
