# Contact-shadow and clamp stability integration

Base main: `e9a0383676720ed17129f47961ca30a2177a2b78`; Git tree `3e00ba441a3689428cde7658f88181ed2d693991`; production identity `387e680e590c1bf1d0f420b7405b7e3bb9ed4d62b7fc46c58129c178e82512f5` (93 files).

Candidate production identity: `79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8` (93 files). The reviewed six-path component manifest is `a8fb8879787b27c82201da21918310df9748d6f719eb44d54d8aad51de0fc772`.

## Concrete repair

The shadow repair changes CabinAttachment and stageLayers. The separately reviewed exact-clamp repair additionally changes keyboardControls. Optional proxy/full cabin meshes are assigned to a dedicated main-visible layer before compile or attachment. ContactShadows uses a layer-0 camera and therefore excludes these optional meshes. Main-view and water-reflection visibility remain intact; exterior/stage layers, native directional shadows, materials, assets, dimensions, DPR, pixel budget and MSAA are unchanged.

The historical route-return failure is a real cached contact-shadow pixel difference, reaching a maximum channel delta of 5/255. Completed capture evidence did not establish a stale camera or requested-state fault. The exact restored-pixel assertion remains byte-identical. This source fix must prove restoration in real CI; CPU draw-selection tests cannot substitute for exact desktop/mobile screenshot equality.

The clamp patch preserves both native control updates, change events, damping restoration and manual-input cancellation. It skips only the additional explicit invalidation when position and quaternion are exactly unchanged after a handled key. Home and wheel behavior remain unchanged; existing pending scene demand is never cancelled or consumed. Genuine movement, including below the controls event threshold, still requests rendering. Its frozen three-path manifest is `43f9d1e7a3a9120d667fee2b0820ea0c541c289aa0522185c21f4fde4c70b9f2` and patch hash is `12f09f37209c836de8440f6f1cc1dd58e6ad4064c53922902b0cc44b84aae8e2`.

This bounded no-op repair does not resolve initial-hero or genuine-zoom native overruns. The original 15-second native/state/pixel deadline remains required, without retries or grace periods.

## Exact independent contract

The new `contact-shadow-clamp-stability-2m-msaa-v1` contract binds only this production identity. The prior cabin-entry contract's request and complete identity remain separate immutable fixtures. Historical source contracts and rejection behavior remain intact.

The new contract inherits the original 13 ordered native captures, all phases and deliberate resize, original input sequence, geometry, native MSAA evidence, quality, timing, retry, pixel, pointer, context, resource and error assertions. Native driver and observer are byte-identical. Whole functional drivers and readiness helpers are hash-pinned to the baseline, including the original exact route-return pixel comparison. Lifecycle source changes only in explicit eligibility for the new source contract; its capture actions and assertions remain unchanged.

No experimental endpoint schema, causal collector or substitute acceptance lane is included. Only the exact reviewed clamp no-op repair described above is added. A later collector must remain independently reviewed and cannot erase failed original motion evidence.

## Verified privately

- 391 socket-free Node policy/observer/contract tests passed.
- 224 affected Vitest tests passed across 20 explicit suites; 74 additional keyboard/shadow neighbor tests passed across three further suites.
- TypeScript no-emit and changed-script syntax checks passed.
- Focused tests include actual prepared-GLB contact-shadow draw isolation, compilation-before-attachment ordering, layer restoration and reflection visibility, native capture readiness, demand admission/resize, pixel density and retained navigation initialization.

No local browser, server, socket, build, screenshot, remote mutation or publication was used. Actual cabin/lifecycle/functional and unchanged original native-motion CI remain required on this exact source.
