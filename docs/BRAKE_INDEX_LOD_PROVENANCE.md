# Staged brake-index runtime candidate

This is a runtime A/B candidate only. Offline inspection is not production visual acceptance or a measured FPS improvement. The measured static-studio batching implementation, original 2,000,000-pixel budget and native MSAA are unchanged. No geometry transform, material-role map, renderer, cabin/proxy representation, interaction or disposal implementation changes.

## Exact asset lineage

- Original artist: Ciasny, “Nissan GTR R35” at https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a
- Author: https://sketchfab.com/Ciasny
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Derivative changes and credit are disclosed in the runtime credits, both attribution files, manifest and GLB metadata. No endorsement is implied.
- Original downloaded source SHA-256: `c2bb4967ef2648f8f8bbb27ad1e97d99e3148e34d114f3c9f0cac4f27c690dc4`.
- Optimized input: `/models/ciasny-r35.glb`, 8,296,356 bytes, SHA-256 `fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d`, 566,475 triangles. Its manifest entry and all chunks remain unchanged and it is still reconstructed for rollback and source-pinned historical diagnostics.
- Candidate: `/models/ciasny-r35-brake-index-e9425289.glb`, 8,566,388 bytes, SHA-256 `e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9`, 406,341 triangles.

Only primitive index bindings on mesh/node partitions 75–78 change. Their Brakes_Plastic.001 names are exporter partitions that include tire/wheel geometry; they are not four individual brakes. The original 8,143,000-byte binary prefix is exact, as are all original accessors/buffer views, source vertex/normal/UV/tangent bytes, materials, textures, nodes/transforms and the other 78 meshes. Four compressed index streams/accessors are appended. Original obsolete index ranges remain retained for provenance.

The four targets have 33,147 / 30,807 / 40,094 / 25,760 triangles, down from 87,541 / 82,570 / 75,168 / 44,663. Total reduction: 160,134 triangles (28.27%). Referenced vertex buffers stay full size. Raw download grows 270,032 bytes (3.25%). Reproducible Python gzip.GzipFile (empty filename, level 9, mtime=0) output is 6,205,731 bytes, SHA-256 `95a67d2253f388bfbc382ee444f9e48ee6b578ffc4f0591d8ebc9efce0c46a1e`; the original gzip is 6,054,849 bytes. Two independent encodes reproduce the candidate gzip and decode to the exact GLB. Compressor implementation matters; Node zlib can differ. This trades triangle/index work for a larger download; it does not claim lower vertex memory.

The source package contains frozen canonical indices, deterministic exporter, protection coordinates, before/after offline Blender comparisons, attribution and independent verification. All original geometric boundary positions are retained. Sampled nonzero-area surface error peaked at 1.543 mm; this is a finite-sample observation, not an exhaustive Hausdorff bound. Source normals are retained rather than recomputed. Extreme closeups, rotor holes, dark tire outlines and partition shading still require actual runtime review.

## Preparation and proof

The existing offline preparation reconstructs both assets from ordered, per-chunk size/hash-pinned pieces no larger than 256 KiB; it checks complete payload length/hash and GLB structure before atomic publication. No runtime simplification, external fetch or URL-byte substitution is introduced. Candidate has 33 new chunks. Tests decode compressed indices, enforce valid ranges and exact counts, compare the complete normalized metadata to the original, prove immutable original bytes and exercise real file-serving callback behavior through a mocked HTTP factory without constructing a server or opening a socket.

Current runtime network proof and current E2E/material-proof fixtures use the new URL/hash. Historical capture-path, screenshot-feature, pipeline, GPU and isolated housing/preview policies retain their source pins. Historical full-motion contracts select the original exterior; only the new exact candidate source tree selects the derivative.

## Acceptance still required

`qa/dpr-motion-request.json` selects the new closed `brake-index-lod-2m-msaa-v1` contract. Both `[stage-dpr-motion]` and `[stage-cabin-integration]` are required. It retains all 13 captures, native inputs, viewport rows, original 2M buffer/MSAA creation proof, 45-second screenshot deadline with at most 2 attempts and unchanged performance/flicker/resource/error thresholds. Historical static-studio request and 88-file identity are frozen separately. The candidate production identity differs only in `src/data/models.ts`.

Before adoption, compare actual Wheel detail, Front ¾ and Rear ¾ desktop/mobile presets plus orbit extremes under identical quality settings. Require no geometry/shading regression and useful measured runtime improvement. The current desktop full-motion baseline remains failed; this asset integration alone does not resolve it. No browser/server/socket was run for this staged preparation; publication and actual CI remain held for separate approval.
