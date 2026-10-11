# Private static-studio batching candidate

This is an independently reviewed experiment, not release or performance acceptance.

## Exact source and intended variable

- Candidate: `6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261` (88 production files, `r35-production-source-v2-with-index`).
- Original 2M + MSAA: `0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8` (87 files).
- Production changes relative to original are only `staticStudioBatching.ts` and its `venueGeometry.ts` call site. Relative to current no-MSAA source, `VehicleScene.tsx` also restores the original `antialias: true`.
- Original exterior GLB including all brake geometry, cabin/proxy, lighting, textures, shadow policy, DPR, resolution budget, camera and input behavior are unchanged.

## Bounded batching

Only the studio factory supplies these six immutable opaque groups, before mounting or reflection cloning:

1. Four independent pit doors: each door's 15 slats becomes one spatially local mesh.
2. Eighteen floor expansion joints become one mesh, retaining their actual polygon-offset material instance.
3. Four bay lines become one mesh, retaining their separate actual polygon-offset material instance.

No material buckets span arbitrary architecture. All overhead meshes and inspection names remain unchanged. Other environments are not batched. The helper rejects hidden, transparent/transmissive, animated, mirrored, customized, partial-draw and otherwise incompatible inputs. Material identity, attributes, layers, render order, casting, receiving and frustum-culling flags are preserved. Source groups on scalar-material geometry do not select a material or a draw range in Three; the merged scalar-material geometry therefore has no draw groups and produces one equivalent submission. No triangle is removed or welded.

Geometry is baked in the venue-root coordinate system. Negative local determinants are excluded rather than silently reversing winding. Temporary cloned geometry is disposed after merging. Replaced source allocations are released only if no retained mesh shares them. The factory owns the final merged allocations, materials and cloned maps; cached source textures remain untouched. Existing repeatable disposal remains available for StrictMode re-upload/unmount.

## CPU evidence

- Complete authored venue: 414 -> 338 meshes; 15,394 triangles unchanged.
- Exact hero camera: venue 178 -> 116 submissions, 6,994 triangles unchanged.
- Including the unchanged contact receiver, exterior and proxy, expected full hero frame: 279 -> 217 draws, 619,388 triangles unchanged. This is a reconstruction, not an observed candidate WebGL frame.
- Real Three shadow traversal: full 468 -> 412 total draws, stage 386 -> 330, with 581,763 triangles unchanged. Cutaway 440 -> 384 draws with 580,275 triangles unchanged. These test expectations subtract exactly 4 * (15 - 1), not a looser threshold.
- Independent transformed triangle/material/flags multiset checks preserve every oriented face, UV, normal and world bound. Position tolerance is below 2 micrometres for Float32 baking, normals/tangents below 1e-7, UVs and tangent handedness exact. No tangent attribute is present in these six authored groups; additional synthetic positive-scale tests cover tangent preservation.
- Tests cover negative/transparent/hidden/customized exclusion, source material identity, shared-geometry retention, temporary allocation disposal, repeated owner disposal, reflection clone sharing, layer configuration, all cutaway transitions, mounting and environment changes.

## Culling caveat

Aggregate bounds deliberately coarsen object-level culling. The GPU still clips the same world-space geometry, but submitted triangles and savings can differ at other camera positions. Each door batch is bounded to 180 triangles; floor-joint and bay-line batches contain only 36 and 8 triangles. This avoids broad whole-studio material merging. Actual screenshot equivalence and total-frame submissions still require the exact-source CI run; CPU evidence cannot prove GPU timing or physical-device FPS improvement.

## Motion gate

`static-studio-batching-2m-msaa-v1` is a closed contract bound to the exact production identity above. It preserves the historical motion path, every input and wait, all 13 ordered captures, original pixel/nonblank/pointer/frame/error checks and two 45-second screenshot attempts. Desktop dimensions remain 1967 x 1016, then 1920 x 966; mobile remains 585 x 558, then 645 x 642 after the deliberate resize. Both use the original 2M pixel ceiling and 1.5 DPR ceiling.

Native context attributes/default framebuffer samples are queried once immediately at creation during untimed setup. Requested and returned antialias must both be true. Samples must be a safe integer >= 2 and sample buffers a safe integer >= 1; the contract does not assume four samples on every device. Historical 1M/MSAA and 2M/no-MSAA contracts and their archived source identities remain separately tested.

No local browser, server, socket or actual WebGL was run. No public mutation or Library browser-artifact upload was performed. The parent owns the separately authorized exact-source CI measurement and any later acceptance decision.
