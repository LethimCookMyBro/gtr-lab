# GT-R LAB QA and red-team report

Date: 2026-10-01. Status: **application mechanics verified; full product acceptance blocked by vehicle assets**.

## Verified evidence

- Local current tree: 81 unit/DOM/server tests pass, TypeScript check passes, production build passes
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

- An accurate, production-quality R35 model with a detailed cabin; the original Blender study was rejected and is not included in the site
- Real vehicle geometry/material/light quality, cabin camera placement, outdoor grounding, mobile GPU performance or meaningful six-variant geometry differentiation
- Paint-rail scrolling to the last two swatches on a real interactive vehicle
- 1600×900, 1366×768 and tablet-specific visual review
- Recorded engine sound, part animation or unsupported features (none are faked)
- Railway live deployment and the final GitHub About Website URL

## Environment and acceptance boundary

The direct cloud browser could not create a WebGL context for the reference site and rejected the application’s local preview URL. Those are environment limitations, not reported reference-site bugs. Authorized GitHub Actions supplied a working browser and software WebGL for the tests above.

A green scaffold/fixture build is not a finished six-variant premium configurator. Acquire and inspect accurate, lawfully usable vehicle assets, integrate and test the real vehicles, then verify the Railway preview before claiming full acceptance. Main contains in-progress source; a temporary WIP branch still awaits authenticated removal.


## Licensed-exterior integration checkpoint

The official Ciasny CC BY 4.0 R35 exterior is integrated on a single route, with attribution and explicit custom-aero/model-year limitations. Source and optimized payload hashes, numerical validation and adaptation records are in `MODEL_PROVENANCE.md`. The source has no cabin; Interior remains disabled while a fitted reference-guided cabin is developed. No rejected original exterior is included.

Fresh local aggregate verification: 136 unit/DOM/build-helper tests passed across 17 files, production typecheck and build passed, renderer QA typecheck passed, and the dedicated real-car suite lists 10 cases across 1440×900 and 390×844. These new real-car cases have not yet run in CI at this checkpoint.

New regressions isolate floor/panorama geometry from the contact-shadow depth pass, keep declared reverse emitters inactive, prevent the loader from being labeled a photo reference, separate source geometry from catalog specifications, expose creator/license/changes, and verify offline chunk reconstruction with complete hashes, bounds and symlink/path checks.

Embedded GLB images use local blob URLs through ImageBitmapLoader. The production CSP now permits only self and blob connections; no external hosts or general JavaScript eval were added. An HTTP header regression verifies this narrow policy.
