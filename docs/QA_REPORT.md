# GT-R LAB QA and red-team report

Date:2026-10-01. Status:**partial implementation verified; full product acceptance blocked**.

## Passed on current tree
- `npm test`:54/54 tests across8 files after formatting/integration
- `npm run build`:TypeScript project check and Vite production compilation succeeded
- `npm run typecheck`:passed
- `npm audit --omit=dev`:0 reported production dependency vulnerabilities at check time
- Six actual-variant photographs licensed/attributed; all optimized JPEG/WebP sources decoded and visually inspected by asset worker
- Two CC0 outdoor HDRIs verified against official byte sizes/MD5 and visually inspected; derived previews use asset pixels rather than non-CC0 website example renders
- Generated original desktop homepage/configurator/lineup and mobile concepts inspected with image viewer; they are design references, never shipped as fake UI

## Exercised without a browser GPU
- Home and models semantic output, six distinct entry routes
- Detail drawer open, source-year content, Escape dismissal and focus return
- Variant switching, unknown variant, Back, repeated panel changes
- Honest photo fallback and disabled paint/light/cabin controls when asset is absent
- Sound preferences, no AudioContext on mount, unsupported audio error recovery
- Central state validation and reset, failed HDRI recovery to Studio
- Real Three material binding/normalization, actual GLB parsing, byte progress, original material preservation
- Paint interpolation and reduced-motion immediate update
- All8camera preset convergence using actual OrbitControls math
- Keyboard orbit/zoom/manual cancellation and interior look helpers
- ImageBitmap/resource cleanup deduplication
- Production server deep links, missing-asset404, HEAD, encoded traversal protection, method allowlist and content security headers

## Red-team bugs fixed
1. Top view violated orbit polar clamp, causing never-ending demand renders: corrected preset, all8views regression-tested
2. Failed HDRI trapped Retry in cached errors: environment-only boundary, cache clearing, visible Studio fallback, synchronized UI and safe retry action
3. Exterior canvas lacked keyboard navigation: focusable canvas, arrows/zoom/Home controls and instructions
4. Paint snapped immediately: linear-color frame interpolation, reduced-motion bypass
5. Loader showed100before render readiness: parsing capped99; vehicle+environment frame readiness gate
6. Asset panel claimed liveWebGL even during fallback: runtime-aware wording now separates asset availability from actual current view
7. Accessible model-button names ran together: explicit coherent labels
8. Unsupported audio left remembered preference on: persistent state reverts off with meaningful error
9. Server buffered large HDRIs/GLBs including HEAD: streams GET and does no payload read for HEAD
10. Controls relied only on declared material names: paint/light availability now comes from actual matched bindings too

## Not run / not established
- Built-site browser interaction, screenshots, touch, overflow and layout at1920×1080,1440×900,390×844,430px,tablet1600/1366
- Actual vehicle WebGL appearance, cabin detail, material tuning, light realism, photographic ground alignment, camera view calibration and mobile GPU performance
- No final concept-to-browser screenshot fidelity ledger can be marked pass without actual render evidence
- No GitHub remote commit or CI result; no Railway deployed URL

## Exact environment blockers
- Reference cloud browser: THREE.WebGLRenderer context creation failed with GL_VENDOR/GL_RENDERER Disabled. One reload did not resolve it
- Built-site navigation: `http://localhost:4173/` was rejected by cloud browser with `net::ERR_BLOCKED_BY_CLIENT`
- Isolated cloud Chromium fallback: OS `socket() failed: Operation not permitted`; reviewed escalation produced the same error. No restriction bypass attempted
- Current runtime portable, no advertised supported local-preview forwarding tool. Do not infer public-site failure from this environment limit

## Visual fidelity ledger (honest pending status)
| Point | Target evidence | Current implementation | Status |
|---|---|---|---|
| Headline/navigation | Original homepage concept | Code-native content and typography tokens | Browser match unverified |
| Vehicle prominence | Original concepts + user screenshot | Rights-cleared photo fallback, realGLB pipeline | Geometry missing; cannot pass |
| Configurator UI | User screenshot right toolbar/bottom rail | Right tools and bottom paint rail | Browser framing unverified |
| Mobile recomposition |390px concept | Bottom dock +scroll swatches +sheet CSS | Touch/overflow unverified |
| Interior | User detailed cabin screenshots | Fixed-seat look controller gated by asset capability | Detailed cabin asset missing |
| Outdoor realism | User forest/coast screenshots | Verified photographic CC0 HDRIs +ground projection | Vehicle grounding unverified |
| Legal/source clarity | User no-official-brand/no-rips requirement | Independent notice, per-photo licenses, correct year captions | Content verified |

## Acceptance boundary
The54unit/DOM/server tests and passing build are useful evidence, not a substitute for livebrowser/GPU validation. No current view is called a finished six-variant3D configurator. Acquire and inspect production-quality licensed meshes, run browser QA in a permitted environment, fix visual findings, verify exact GitHub commit, then deploy/verify Railway before marking complete.

## First GitHub browser run (2026-10-01)
Commit `b22fc600050dcddcfc4c5e48408f3fd8f523ff26`: GitHub Actions run `36830977636`. Unit tests 79/79 and TypeScript passed. The real browser suite passed 12/16 cases across 1920×1080, 1440×900, 390×844 and 430×932. Four pending-asset checks had a test-only race: an immediate locator count ran before the lazy configurator mounted and chose the wrong canvas assertion. Failure snapshots show the correct labeled photographic fallback. Fixed by waiting for the expected route heading and asserting the intentionally missing GT500 state directly.

Actual screenshots inspected: desktop home at both required widths, mobile home/model collection/configurator/details, desktop configurator. Model/detail spacing and mobile controls fit; no horizontal overflow was detected in tested model routes. Initial hero screenshots caught the entry fade before it finished, so evidence capture now fast-forwards finite animations and uses CSS pixel scale. Static composition must be reinspected from the next run. Actual vehicle realism/GPU flow remains a separate unmet criterion.
