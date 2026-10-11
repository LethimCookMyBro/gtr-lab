# Source-bound render repair candidate

Private integration baseline: main commit `9a06f1ec99f53c5ee05b9d81a92853e8b2f67c1d`, production identity `c3e6b02d198bbcdad46d403101706bbe859390d72729c6391adb01751ba0c3ca` (90 files).

New reviewed production identity: `814ff47e781f112127596422caad0413c176331f892e9dc5697e10a1c36923c1` (93 files). The separate closed request is `render-repair-readiness-2m-msaa-v1`. Historical request, source identity and acceptance remain frozen under the original render-backpressure contract.

## Reviewed runtime delta

- Defer native drawing-buffer resize until the next admitted demand tick, retaining the previous painted buffer while pending.
- Measure camera and paint/lamp interpolation from the latest committed target, so sparse admitted frames use elapsed wall time without consuming earlier idle time.
- Add read-only functional capture observation of applied camera/vehicle state, the actual default-framebuffer main draw and native fence completion. Material and cabin functional drivers explicitly opt in; native-motion and injected lifecycle drivers do not.

No model, texture, asset-selection URL, DPR limit, pixel budget, MSAA setting or normal-motion capture helper changes. The original exterior, full cabin and simplified window proxy bytes remain exact. Main draw completion is distinct from a later pending-prefix drain; neither a fence-only signal nor a newly attached owner can substitute for the requested scene state.

## Independent proof lanes

The same reviewed main push must contain `[stage-dpr-motion]` and `[stage-cabin-integration]`. It schedules the existing desktop/mobile native-motion and injected-lifecycle lanes, plus material and cabin functional workflows. No lane suppresses or replaces another.

The native driver and observer are byte-identical to 9a06. All original input actions, 13 ordered captures, stable/resized dimensions, screenshot deadlines and retry limits, performance, pointer-change, blank/flicker, context, resource and error assertions remain unchanged. A new contract cannot qualify under an old contract's source digest or omit its exact contract name.

The lifecycle source includes the separately reviewed two-defect harness correction. Integration alters only explicit eligibility for the two exact source-bound contracts and the reported contract name. Its browser actions, readiness/ownership assertions, fault fixture, timing and native capture behavior remain those of the reviewed correction.

Historical CI run `38133536891` is retained as failed evidence. Completing 13 captures per lane with zero retries did not eliminate its blank resized frame or sparse cabin-frame coverage. This repair is not a claim of improved FPS, hardware performance or completed release acceptance.

## Socket-free integration verification

- 365 Node policy/observer/identity tests pass.
- 396 affected Vitest tests pass across 25 explicit files.
- TypeScript `--noEmit` passes.
- Tests include exact historical/current identity separation, complete original geometry/MSAA/capture equality, every blank/missing/substituted capture rejection, both lifecycle gates, unchanged native driver/observer hashes, and the exact eight-path runtime delta.

Actual CI functional, lifecycle and unchanged native-motion results remain required on this exact candidate before any acceptance claim. No local browser, server, listener, screenshot, deployment or publication was used for this integration.
