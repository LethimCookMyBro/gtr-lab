# Contact AO plus static face candidate

This separately named candidate is private pending exact-source application WebGL comparison. It is an original approximate cabin study, not Nissan CAD, measured factory trim, working instruments or live telemetry.

- Active GLB: `/models/r35-cabin-contact-ao-static-faces-8645956f.glb`
- GLB SHA-256: `8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452`; 20,195,752 bytes
- Preserved gzip source: `../r35-cabin-contact-ao-static-faces.glb.gz`
- Gzip SHA-256: `efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16`; 10,194,084 bytes

## Lineage and recovery

The dashboard baseline `5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326` remains unchanged in `../r35-cabin-dashboard.glb.gz`, and its original versioned URL is still emitted by offline preparation. The exterior-only proxy `49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347` and its source/URL are unchanged. The proxy continues to depict the simplified baseline cabin in the exact same native frame; it is not relabelled as the textured combined model.

The static-face upstream model is `eeb932963006eb3bf33ff84d5c469da34b7a9dc87628e4ccb139b87b78793b57`, preserved in the original author package (Library source item libfile_d717e08aa4948191aa4d5e83dba9514d). It adds original static media/climate/dial artwork and removes 3,286 superseded dial-marking triangles without creating polygons or changing placement/pivots. Its atlas is a fixed illustration. The font license is retained verbatim at `/licenses/cabin-static-faces-DejaVu.txt`, with public Credits attribution.

The added contact shading uses 32 deterministic short-range cosine-weighted AO samples, 65 mm radius and 0.65 mm offset against unchanged cabin geometry. Seventeen materials use the existing leather ORM red channel as a scalar lookup with normalized UInt16 TEXCOORD_3 on 105 primitives. G/B source pixels and the other images remain unchanged from the static-face input. AO strength is 0.65. Leather normal scale changes 0.8→0.55, upper dash 0.62→0.45, roughness factor 1→0.98. This is static shading: future component animation must revisit the baked contacts.

## Resource accounting

Combined indexed accessor total is 505,664 triangles across 309 primitives and 46 materials. The baseline and AO-only variant each have 508,950 indexed triangles; the 3,286 difference comes from the static-face pass, not degenerate filtering. All these totals are full indices.count/3 sums.

Combined geometry is 18,323,648 bytes; estimated RGBA/full mip chains are 21,321,052 bytes, totaling 37.808 MiB before driver/renderer overhead. Baseline is 34.283 MiB. Gzip grows by 395,478 bytes (4.04%). Eleven encoded images are identified individually in asset-resource-manifest.json.

The real GLTFLoader creates 62 Texture objects sharing eleven Source objects. Baseline creates 44 sharing ten. Actual preparation construction therefore creates 78 compile batches + 62 Texture init jobs + 78 geometry batches, versus baseline 78+44+78. Per-Texture init preserves renderer ownership even when image storage is shared. Shader compile does not establish those texture properties; bounded geometry draws later reuse them.

The socket-free test uses actual Three WebGLTextures bookkeeping and the actual material owner with native-GL/bitmap test doubles. Its current sampler/color-space keys produce eleven allocations and uploads (baseline ten), with a second init of every Texture adding none. This is not an actual GPU allocation measurement or a generic claim that N images always use N GPU textures. All 62 Texture objects, 46 materials, 309 geometries and eleven bitmap fixtures retire exactly once.

## Verification boundary

Copied author receipts describe CPU/binary/offline checks only. Native offline Blender images do not reproduce Three AO lighting; the proxy AO images are an approximation. Application shader acceptance, actual GPU memory, preparation/entry time, low-memory/context recovery, and rendered desktop/mobile quality require the new source-bound browser comparison. No existing historical QA allowlist is expanded or reinterpreted by this integration. The scheduler, renderer lifecycle, camera, budgets and accepted proxy bytes are unchanged.
