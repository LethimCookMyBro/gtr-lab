# Cabin entry and functional capture repair

Baseline: main `6ff2c1c822c2eada5a64a1080da255e4b3b32112`, source identity `814ff47e781f112127596422caad0413c176331f892e9dc5697e10a1c36923c1` (93 files).

Candidate source identity: `387e680e590c1bf1d0f420b7405b7e3bb9ed4d62b7fc46c58129c178e82512f5` (93 files). Only `src/components/three/CameraRig.tsx` differs in application source. The first cabin-entry view applies its cabin eye, look target and FOV before the admitted main draw. Later seat transitions retain target-clock interpolation; native manual input and exterior motion remain under their existing contracts.

The reviewed helper repair compares scene snapshots structurally, so object-property order cannot reject otherwise identical applied state. It retains the exact requested state, observed main draw, actual native completion, owner lineage, dimensions and absolute deadline requirements. Cabin workflow dependencies and deterministic regressions cover the recorded equality failure.

The three functional capture consumers now opt in to the existing applied-state/native-completion observation. The shipped nonfatal pending notice waits within the original readiness deadline; actual errors fail. Camera reselection, paint/environment state, native draw completion and post-capture validity remain explicit. Exact canonical reset, clamp, pointer/pixel-change, shared-HDR, screenshot timeout and retry assertions are retained. The original 90-second physical readiness stage is unchanged; actual rendered settling still has its original 15-second bound.

## Independent source contracts

`cabin-entry-functional-2m-msaa-v1` is a new exact source-bound contract. Its complete geometry, native MSAA proof and all 13 original capture inputs, order, dimensions, deadlines, retries and assertions are inherited unchanged. The old `render-repair-readiness-2m-msaa-v1` request and 93-file source identity are historical fixtures, alongside the earlier contracts. The historical controls driver is retained byte-for-byte so prior instrumentation boundaries remain testable.

The native-motion driver and observer are byte-identical. Their imported screenshot-retry function is also byte-identical, even though the functional controls driver now opts in during its own execution. Lifecycle capture behavior changes only by adding this exact contract to eligibility; its actions, original corrected assertions and fault observation remain uninstrumented and unchanged.

The endpoint-validator proposal is excluded from this candidate. No endpoint result or functional screenshot readiness can replace the original failed native-motion gate or claim moving-capture acceptance.

The observed five-second startup navigation failure remains unresolved. Startup diagnosis did not establish a safe source fix; this batch leaves that deadline unchanged and makes no startup-reliability claim.

## Verified locally

- 379 socket-free Node tests pass.
- 491 affected Vitest tests pass across 29 explicit files.
- TypeScript `--noEmit` and seven changed-script syntax checks pass.

No model, asset, binary, pixel budget, DPR limit or MSAA change. No local browser/server/socket, screenshot, build, remote mutation or publication was performed. Actual functional, lifecycle and original native-motion CI on this exact source remains required.
