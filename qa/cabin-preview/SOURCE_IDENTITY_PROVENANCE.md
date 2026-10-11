# Legacy inspector source-identity reconciliation

This change updates only the reviewed `materialAdapter.ts` identity in preparation and its matching test. It repairs the new pre-browser source guard failure observed in Original cabin WebGL review run 38116076586 after the approved exterior-window proxy integration. It does not change the inspector's models, browser path, appearance contract, capture rules or timing limits.

## Source lineage

The inspector's `sourceBaselineCommit` remains `276be604e8ff22afbeabecb42d6805187a7068cb`. This is the original adapter lineage, not a claim that all current source bytes were authored at that commit. Frozen baseline screenshots and timing results remain attributed to `93d4fda63915c64ff1b3a8d852128fba667873f0` in `reference-baseline.json`.

The reviewed runtime base was main `70b7644944f908a0dfad8999b0a44a61d84d5d4d`, tree `4258795b2460bf7104c56ec21ed873fe15b4c231`. The separately reviewed 29-file proxy change then arrived at main `4d0f40ac1fd2213f07b0957986496b1360b4d18d`, tree `9a2438e5b96b21b251d365c692aee8c509ce1458` with six capture-diagnostic files. The 29 proxy payload files match their reviewed manifest; the legacy adapter pin was omitted from that payload.

- Original adapter Git blob: `4677edf8203108556ab02dc5a16e0fb94b894f54`
- Original adapter SHA-256: `2e5cc1ccea9ce25c76dd35927b106dbf76262088e44e6b82e56a11269c6bc546`
- Reviewed proxy adapter Git blob: `744e006a5a57f5137f93ec12ffb1ec2654e0c8e1`
- Reviewed proxy adapter SHA-256: `92b38a50f78a8b90166ea85c69c99d7f1387955c974b2fddcf4c783d2ea1ba51`
- Unchanged `sceneHelpers.ts` Git blob: `fbcc786d7c408be8ce5ee140106b7c5bc0c727dc`
- Unchanged `models.ts` Git blob: `d432f5db38eb7633d931b838e6241604c83aeeae`

`models.ts` already contains the previously reviewed cabin disclosure/capability metadata. Its complete bytes are identical between the runtime base and proxy snapshot, and its current pin is correct. The exterior `materialRoles` and `disabledEmissive` assertions in `test/preparation.test.mjs` stay unchanged.

## Why the adapter change is compatible with this inspector

The approved adapter adds restoration ownership before resource disposal and an optional `nativeCabin` parameter, defaulting to `false`. Its native branch suppresses cabin shadows and avoids renormalizing an already native-frame cabin. The legacy inspector calls the adapter with its existing three arguments for the exterior, so that branch is not selected. The default exterior still uses the original normalization and both shadow flags. Material-role assignment, material adaptation, paint/light interpolation, immediate appearance application and capability detection remain unchanged. No restoration callback is registered by the legacy inspector.

Offline regression evidence compares the two exact adapter blobs on the pinned exterior geometry. Across initial preparation, four paint/light states and three interpolation/reduced-motion states, all 82 meshes and 566,475 triangles have equal transforms, shadow flags, bindings and scalar material state. This comparison retains material scalar values but excludes image decoding and texture sampling. It is CPU/source evidence, not pixel equivalence or WebGL acceptance.

## Unchanged evidence and limitations

The exact spatial/global/sealed GLBs, accepted exterior, geometry/finished-source lineage, camera contract, baseline JSON, closure/seam fixtures, viewer, runner and workflow are unchanged. The original 90-second GPU completion and 120-second sample deadlines remain in force. All 57 existing legacy Node tests pass after preparation with the corrected pin. No existing test assertion is removed or relaxed; only the expected adapter identity changes.

The historical desktop 90-second GPU-completion benchmark timeout remains unresolved. This new source-identity failure happens before browser execution and is a separate failure. Offline preparation and Node tests do not establish that any prior browser timeout is fixed, that candidate screenshots are accepted, or that performance improved. Actual browser CI still needs to run and its pixels and timing results need review.
