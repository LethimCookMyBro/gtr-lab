# GT-R LAB QA and red-team report

Date: 2026-10-01. Status: **accepted licensed exterior rendering; visual refinement and complete six-vehicle acceptance still open**.

## Real-car checkpoints

- `6025ad53cbcd0d001d7b1afcbecb08c56c0d5982`, [full run36837794879](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36837794879): 136 unit tests and all6 WebGL fixture checks passed. Ordinary UI:19 passed,1 flaky,4 failed; the four failures were the six-variant loop exceeding one30-second budget. The loop is being split into independently budgeted variant cases, without removing any variant assertions.
- Same run, actual licensed vehicle:8/10 cases passed across1440×900 and 390×844. All nine paints, exterior camera views, lamp changes, forest/night/studio environments and503 recovery passed. Two rotation checks timed out while reading PNGs during continuous software rendering. Trace inspection showed the pixels did change: desktop PNG reads took42.28s/32.63s and mobile34.80s/28.64s, exceeding a5-second poll budget. The revised check captures a settled baseline, runs rotation, stops it, restores DPR and compares settled pixels; manual cancellation remains separately exercised.
- `a15a8ea941a75bd1810b5870a78db33039414551`, [visual checkpoint36839510134](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36839510134): actual production GLB rendered at1440×900 and 390×844 with no page/console errors. Inspected pixels revealed an opaque rectangular contact-shadow surface, overly metallic paint and undersized hero framing.
- `ff14bddce792bb55c8996c589bf916e05b058689`, [visual checkpoint36841657612](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36841657612): explicit transparent offscreen clear alpha removed the rectangle at both sizes. A regression uses Three's actual background-clear behavior. Paint response, ground contact and hero size are the next visual pass.

The live file at these checkpoints is Ciasny's licensed exterior only, SHA-256 `fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d`. Interior is disabled. The newly authored cabin was rejected and never referenced by a published commit. No six-vehicle or production-ready claim follows from these partial results.

## Verified evidence

- Pre-asset baseline: 81 unit/DOM/server tests passed with TypeScript and production build checks. Later checkpoints below distinguish real-car results
- Main commit `7efbac60ac1e220c7cd111da4ad3a899752eb0eb`: [GitHub Actions run 36831837406](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36831837406) passed 80 unit tests, 16 responsive UI browser cases and 6 real-WebGL fixture cases, with no retries
- Browser sizes: 1920×1080, 1440×900, 390×844 and 430×932
- Production dependency audit at implementation check: zero reported vulnerabilities; development dependency notices remain separate
- Six licensed, attributed variant photographs and two checksum-verified CC0 HDRIs; the AI-generated homepage illustration is explicitly identified

## Real browser flows exercised

Homepage → model collection → Premium configurator → model details → Escape → Back. All six variant routes and their detail sheets were opened at each target viewport. Pending-asset labels and disabled physical controls were checked. Reduced motion preserved variant navigation. No horizontal overflow was detected in those flows and the primary navigation flow had no page errors.

The isolated WebGL harness uses obvious synthetic test geometry, excluded from the production build. It exercised real GLB decoding/rendering, material-capability matching, paint/camera pixel changes, keyboard and pointer exploration, rotation cancellation, invalid-model recovery, unavailable WebGL feedback, context loss/retry and failed HDRI recovery to Studio. **This is evidence for renderer mechanics, not vehicle realism.**

The later main commit `af06fb4cb704c8a8af2ddd92cd689f2da9d4deeb` passed 81 unit tests, 24 responsive browser cases and six WebGL fixture cases in run https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36833127966. The added cases verify sound persistence and full detail-sheet source/focus behavior.

## Actual screenshot inspection

Settled browser screenshots were inspected at 1920, 1440 and 390 widths. Homepage text is readable and high-contrast. Desktop navigation, right-hand tools, paint rail and detail drawer fit. Mobile navigation, model cards, bottom dock, pending-state controls and detail sheets remain within the viewport. All six model identities have different photographs and correctly labeled photo-year context.

Initial screenshots captured the 0.8-second hero entrance and detail-sheet transition mid-animation, causing transient low-opacity text and right-edge clipping. Capture now fast-forwards finite animations and uses CSS pixel scale. Settled screenshots confirm those were capture artifacts rather than permanent layout defects.

## Red-team defects corrected

1. Top camera conflicted with orbit limits and never settled: corrected preset and eight-view convergence regression
2. Failed HDRI remained trapped in cache: environment-only boundary, cache clearing, visible Studio fallback and synchronized state
3. Canvas lacked keyboard exploration: focusable controls, arrows, zoom and Home reset
4. Paint snapped immediately: linear-color interpolation with reduced-motion bypass
5. Loader reached 100 before rendering: parse progress capped at 99; vehicle/environment frame readiness gate
6. Asset panel claimed live WebGL during fallback: wording now follows actual runtime readiness
7. Model-button accessible names ran together: explicit labels
8. Unsupported audio left the stored preference on: failed start resets preference and displays an error
9. Server buffered large files and HEAD requests: streaming GET, metadata-only HEAD
10. Physical controls trusted declarations without bindings: availability now requires actual matched materials
11. R3F fallback children mounted on healthy canvases and triggered false errors: fallback is now purely presentational
12. Pending-asset browser test checked the lazy route too early: waits for its heading and checks the intended missing-asset state directly
13. GT-R50 inherited an incorrect RWD default: generic factual defaults removed; AWD and six-speed transmission now cite and explicitly label Nissan’s 2018 prototype data alongside 2021 powertrain figures
14. Meshopt decoder required WebAssembly permission: self-only scripts permit WebAssembly compilation without enabling general JavaScript eval

## Still not established

- An accepted detailed cabin; both the original exterior study and subsequent authored cabin were rejected and are excluded from the site
- Final paint/grounding/hero visual quality, accepted cabin placement, physical mobile GPU performance and meaningful six-variant geometry differentiation
- Final comprehensive rerun after the source-normal correction and independently budgeted vehicle flows
- 1600×900, 1366×768 and tablet-specific visual review
- Recorded engine sound, part animation or unsupported features (none are faked)
- Final production-URL screenshot coverage

## Environment and acceptance boundary

The direct cloud browser could not create a WebGL context for the reference site and rejected the application’s local preview URL. Those are environment limitations, not reported reference-site bugs. Authorized GitHub Actions supplied a working browser and software WebGL for the tests above.

A green scaffold/fixture build is not a finished six-variant premium configurator. Acquire and inspect accurate, lawfully usable vehicle assets, integrate and test the real vehicles, then verify the Railway preview before claiming full acceptance. Main contains in-progress source. The temporary WIP branch has been removed after its commits were retained on main; the GitHub About Website field points to the verified Railway URL.


## Licensed-exterior integration checkpoint

The official Ciasny CC BY 4.0 R35 exterior is integrated on a single route, with attribution and explicit custom-aero/model-year limitations. Source and optimized payload hashes, numerical validation and adaptation records are in `MODEL_PROVENANCE.md`. The source has no cabin; Interior remains disabled until a separately developed cabin preview is accepted. No rejected original exterior is included.

Fresh local aggregate verification: 136 unit/DOM/build-helper tests passed across 17 files, production typecheck and build passed, renderer QA typecheck passed, and the dedicated real-car suite lists 10 cases across 1440×900 and 390×844. The subsequent real-car outcomes are recorded above and in the current checkpoint below.

New regressions isolate floor/panorama geometry from the contact-shadow depth pass, keep declared reverse emitters inactive, prevent the loader from being labeled a photo reference, separate source geometry from catalog specifications, expose creator/license/changes, and verify offline chunk reconstruction with complete hashes, bounds and symlink/path checks.

Embedded GLB images use local blob URLs through ImageBitmapLoader. The production CSP now permits only self and blob connections; no external hosts or general JavaScript eval were added. An HTTP header regression verifies this narrow policy.


## Pending next rerun

The next source revision uses44 independently budgeted responsive UI cases (each of the six detail routes now has its own case) and reduced motion for UI-only screenshots. The10 actual-vehicle cases keep separate no-preference rotation/manual-input coverage. Trace-confirmed PNG readback behavior is handled by comparing settled frames at the same DPR.

Local aggregate verification for the calibration candidate:150 tests passed across19 files, typecheck/build and renderer QA typecheck passed. This candidate preserves artist paint metalness/roughness, grounds the floor at y=0, bounds direct-shadow depth, and moves the hero camera25% closer. Projection using the actual vehicle vertices estimates51.7% desktop and82.1% mobile width; browser screenshots must verify the result before visual acceptance.

## Current calibration and deployment checkpoint

- `b123624c2f512ae5b988117b377778bd81386e5f`, [run36843043294](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36843043294):150 unit checks,44 responsive UI cases and6 real-WebGL fixtures passed. Actual car8/10 passed. The remaining combined rotation/manual/variant cases exceeded120 seconds after the rotation pixel proof had passed. Trace timing measured24 RAFs at24–37s, Stop at8–13s, comparison PNG28–38s and a duplicate PNG10–22s. This is a software-renderer timing diagnosis, not proof of acceptable physical-GPU performance.
- The next vehicle suite splits automatic rotation, manual keyboard/touch/pinch and variant separation into independent flows without removing assertions or increasing the120-second case budget. The comparison image also serves as its artifact, removing duplicate readback. It restores reduced motion only after the explicit Stop action, keeping actual automatic rotation exercised with no-preference.
- `01c12926c047458295fd33b7bd41c11a34a12c39`, [visual run36844847179](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36844847179): both1440×900 and 390×844 rendered studio,forest and coast, with no page or console errors. Actual pixels show the full silhouette, grounded tires, no rectangular shadow plane and improved mobile centering. Forest/coast panoramas change reflection mood and ground projection. Studio normals/high-contrast trim and outdoor title contrast still need refinement.
- The initial six-view smoke matched a forest thumbnail HTTP response in its report. Actual pixels showed the loaded forest, but the next script narrows network evidence to `.hdr` so thumbnail readiness cannot substitute for environment completion.
- Source audit isolated damaged split normals in the manual Blender vertex-bake step. The corrected exterior retains exact source geometry, split normals, tangents and hierarchy, with a parent normalization wrapper and lossless compression. The candidate remains outside the published application pending its separate asset-release process. Same-lighting actual-browser comparison is required before claiming the visible facets corrected.
- Railway revision `b2579cef674d09d1aeeee5df63462bd5839c2211` is healthy at https://gtr-lab-production.up.railway.app/. Homepage,deep links and GLB endpoint return200. The direct cloud browser verifies navigation and its WebGL-unavailable fallback. The public-URL Chromium workflow supplies separate deployed3D evidence; do not conflate the two.

The reference rerun retained DOM observations at both sizes but all10 screenshot attempts timed out. Route entry and color-input values were verified; visual paint, camera and toolbar behavior remain unverified. `REFERENCE_AUDIT.md` distinguishes attempted actions from observed results.

## Verified preview before homepage redesign

Revision `1a6f68faf21cc32442a1ef919e05049716194ae0`:152 unit checks,44 UI cases,6 renderer fixtures and all14 independently budgeted real-vehicle cases passed their CI steps. The public-URL Railway smoke run36847271913 passed after waiting for Railway to report this exact revision successful. Both desktop/mobile checked live paint, lamp and detail controls and studio/forest/coast media. The latest user still rejected the static homepage design; this functional evidence does not constitute visual/product acceptance. A separate real-video, asymmetric-editorial and scroll-choreography redesign is in progress.


## Cinematic homepage revision — pre-release media gate

- Main46666fa passed the full quality job36854114388. Homepage layout job36854114469 passed its4 desktop/mobile cases;6 real-media cases were explicitly skipped because film integration had not happened yet. These are not media acceptance results.
- Actual screenshots identified and verified fixes for mobile editorial image overlap, all three era controls, R32 image visibility and detail-film frame filling. Later caption/credits spacing, short-height sequencing and full-height hero framing await the real-media capture.
- The original hero/detail CGI clips are each8seconds,1280×720,24fps,H.264,noaudio,fast-start. Their source meshes/normals match the untouched Ciasny import. Decode/loop/crop studies are separate from app overlay acceptance.
- Local verification after media playback review and transport pipeline:225tests, TypeScript and production build. Media build tests include50 byte/hash/path/symlink/boundary cases. Browser acceptance explicitly requires real duration/time progression, native pause, reduced-motion/Save-Data explicit Play, offscreen pause and two distinct composed temporal frames per clip at1920/1440/390.
- No release is implied until those browser outputs are inspected. The existing Railway service remains on the last reviewed preview during this gate.


## Cinematic homepage preview candidate accepted for release

Application commit `fb8ebf7d35af8b44911aca879d230748a020eec2` passed homepage run [36866873520](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36866873520): 20 passed, 4 intentional duplicate-project skips, zero failures. The broader [quality run36866873577](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36866873577) also completed successfully, including the real licensed-car cases.

The landscape regression came from applying other routes' global scroll-padding to a centered home-era target. The corrected home-only calculation uses measured viewport geometry; actual 844×390 and 375×667 screenshots confirm the selected figure and caption fit. Film credits are now 11px on mobile, remain readable and retain 44px hit targets.

All 12 actual timed film frames at 1920, 1440 and 390 widths were inspected. The desktop car remains dominant, and the intentional mobile nose/rear crops preserve recognizable details. The result is accepted as an original CGI studio preview, not OEM-photoreal or complete six-variant acceptance. Public deployment checks still verify the exact release revision, movie hashes/ranges, native playback and real-car controls.


## Mobile-motion exact-source release gate

Product source 4aa490a110954b41c0b4aac586ba216a85c6872a was recorded in all five plans of [mobile run36887754236](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36887754236). The cancelled 390px runner setup was retried; all five completed successfully. The cancellation occurred during Ubuntu/Chromium dependency setup before the app launched. Actual 390/430px normal and reduced-motion screenshots and recordings were inspected. No horizontal overflow or page errors were reported. The single-year correction removes the earlier overprinted 1989/2007 artifact while retaining complementary photograph fades.

Exact commit 0538e2f8123aba3de1f7cb41b3f7c65f58b8676f passed [homepage run36889777177](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36889777177): 21 passed, 6 intentional duplicate-project skips,0failed. The strict six-viewport portrait sweep includes 600/667px heights, keyboard focus reveal, timeline/copy/credit spacing, native input settlement and the unchanged14-frame/2px stability bound. All six independent film probes measured 0px drift. Native film, reduced-motion, Save-Data, background/offscreen pause and desktop/landscape regressions also passed.

The initial drift diagnosis was corrected after a frame-by-frame trace: a prior focus-triggered native scroll continued after the test issued a new target, before any film resize occurred. The test now waits for eight stationary frames after each preceding input, rather than changing product behavior or loosening the geometry checks. Narrow film scroll-anchor exclusion remains a precaution, not proof that anchoring caused the observed movement.

Local verification at this candidate passed 240 unit/DOM/build-helper tests, TypeScript and the production build. The broader [quality gate36889777218](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36889777218) completed successfully on the same exact commit, including the real licensed-car regressions. The final public-URL smoke is recorded separately in deployment evidence. This mobile-preview milestone does not establish accepted cabin geometry, five additional physical variants or physical-device GPU performance.
