# Private 2M/no-MSAA candidate

This is a candidate for CI measurement, not a validated lag or flicker fix and not release acceptance.

## Exact production scope

Production identity contract: `r35-production-source-v2-with-index`, all 87 files.

- Original 2M source: commit `b3f72d6de048941ce7b21c94b13f2896849b01db`, identity `0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8`.
- Historical 1M experiment: identity `60c442f0d379d3c111393eda9337921b6df853ecf5b6e4024f7ce05d958ab930`.
- This 2M/no-MSAA candidate: identity `8c35f77f0d20e5679dade1e7dd8197ef493deef165b990672b510e9ea7e76145`.

The original and historical snapshots were verified from bytes. Relative to the original, the only production change is VehicleScene Canvas `antialias: true` to `false`. Relative to the 1M experiment, VehiclePixelDensity is also restored byte-for-byte to the original 2,000,000-pixel cap. DPR remains capped at 1.5. Geometry, materials, lights, shadows, demand rendering, released-orbit damping, separate rear renderer, and native alpha behavior are unchanged.

R3F 9.8.1 merges these options before constructing the Three 0.180.0 renderer. Three forwards antialias at native WebGL2 context creation. Three's native context alpha is true even though the app's renderer alpha option is false; this candidate does not change either behavior. There is no runtime antialias toggle or renderer-recreation mechanism.

## Closed CI acceptance

`qa/dpr-motion-request.json` selects only `msaa-off-2m-v1` and the exact candidate identity. A reviewed main-push commit resolves `current` to its literal SHA before source checkout, source verification, install, build, and browser setup. Legacy v1 and the exact `pixel-budget-1m-v1` historical contract remain valid; its request bytes are retained separately as `qa/dpr-motion-pixel-budget-1m-request.json`.

Desktop geometry is 1440×744 CSS / 1967×1016 buffer initially and 1280×644 CSS / 1920×966 buffer after deliberate resize. Mobile geometry remains 390×372 / 585×558, then 430×428 / 645×642. Native device DPR remains 2 on desktop and 3 on mobile.

For this candidate only, the external observer reads actual context attributes and SAMPLES, SAMPLE_BUFFERS, and FRAMEBUFFER_BINDING immediately after the first successful native getContext returns, before Three initializes context state. Each context is sampled once. Reads happen only in setup, before every measured motion phase; later getContext calls, RAF hooks, snapshots, or native buffer writes do not repeat the queries. A newly created context outside setup fails closed without running GL queries. Missing evidence, antialias or requested antialias other than false, samples or sample buffers other than zero, a non-default framebuffer, loss/restoration/detachment, or repeated context creation fails acceptance.

Both viewport jobs retain the complete normal-motion path: all 13 captures, native exterior orbit, rotation and lights, cabin entry/look/keyboard/seat inputs, idle periods, and a separate deliberate resize. Capture and input source bytes are pinned unchanged. Screenshots retain two attempts of 45 seconds each. Existing nonblank, scene-motion, geometry, buffer-write, runtime-bundle, model-identity, frame, and error gates remain. No forced frames, GL state mutation, readPixels, reduced motion, motion-time buffer resizing, or deadline/tolerance reductions are introduced.

Publication, if authorized separately, must include both `[stage-dpr-motion]` and `[stage-cabin-integration]` in the commit message so full motion and cabin acceptance both run against the candidate. No publication is performed by preparing this folder.

## Evidence boundaries

CPU tests can establish option forwarding, context ownership, exact source scope, geometry arithmetic, and acceptance-policy behavior. Synthetic WebGL in the creation unit test is not browser rendering evidence. Actual native no-MSAA state and post-drag capture behavior remain to be observed in CI. SwiftShader cannot establish hardware FPS, physical-device lag improvement, or final visual quality. Removing native MSAA may expose edge aliasing, so real images still require visual review. The earlier 1M reduction reached its exact smaller buffer but did not resolve the repeated first post-drag screenshot timeout; it is retained as historical evidence, not silently combined with this variable.
