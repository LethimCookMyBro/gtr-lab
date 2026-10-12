# Original cabin: fine-scale roughness candidate

This is a bounded appearance refinement of the project's original authored R35 approximation, not an official or factory-exact interior. It derives only from the accepted AO/static-display source, SHA-256 `8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452`.

Only materials 0, 10, 13, 32, 34 and 35 gain `KHR_texture_transform` scale `[4,4]` on their existing metallicRoughnessTexture references. The original roughnessFactor 0.98, normal scale 0.55, image data, AO bindings, geometry, transforms and all other materials remain exact. The extension is registered in extensionsUsed; extensionsRequired is unchanged. The BIN chunk is byte-identical.

The original 64 mm texture repeat becomes 16 mm for these roughness bindings only. This retains the authored roughness values while making their spatial features smaller. It does not reduce roughness amplitude, and its detail no longer aligns spatially with the unchanged normal texture. Actual desktop/mobile images must be checked for visible repetition, aliasing, over-smoothing and worthwhile improvement.

The constant-roughness diagnostic proved that much of the broad mottled highlight came from roughness variation, but was rejected as too uniformly smooth. It remains separate historical evidence. This fine-scale candidate is not accepted merely because its asset tests pass.

Rebuild using Python 3.12 and zlib 1.3.2:

    python export_uv_scale.py --source ../r35-cabin-contact-ao-static-faces.glb.gz --output r35-contact-ao-static-faces-roughness-uv4.glb

The exporter requires the exact original baseline and records deterministic GLB/gzip identities in uv-scale-manifest.json. Output raw SHA-256: `ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0` (20,196,108 bytes). Gzip SHA-256: `b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5` (10,194,113 bytes).

Actual Three CPU loading/current ownership checks preserve 62 owned Texture objects, 11 image allocation identities and 10 controlled program signatures. Twelve extra temporary loader wrappers share existing image Sources and have no GPU-bookkeeping allocation. Owned textures/materials/geometries dispose once and all 11 shared bitmaps close once in that harness. These are CPU/bookkeeping checks; actual native preparation/retirement remains required. Texture sampling changes, so no identical-workload or speedup claim is made.
