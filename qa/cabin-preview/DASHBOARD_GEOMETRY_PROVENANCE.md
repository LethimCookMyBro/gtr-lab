# Incremental center-vent geometry provenance

This is an original authored, approximate center-vent and fascia increment for the existing 2024 US LHD Premium Red Amber cabin study. It is not Nissan CAD, a licensed OEM replica, a full cabin reconstruction, or acceptance of a completed six-variant experience.

## Exact lineage

- Historical sealed, untextured cabin: SHA-256 `3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd`, 14,599,520 expanded bytes. Its separate `r35-sealed-spatial.glb.gz` is unchanged.
- Retained material-only input: SHA-256 `0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83`, 18,848,516 expanded bytes. Its separate `r35-cabin-realism.glb.gz` is unchanged: 9,758,286 bytes, SHA-256 `b40071d2f5f2e57af9891697c8cb73ca1d57c10b0f1cc3c3dc3d9c097b1aa5dd`. The surface authoring and Ciasny badge attribution remain documented in REALISM_PROVENANCE.md.
- Current incremental geometry candidate: SHA-256 `5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326`, 19,170,816 expanded bytes. Separate `r35-cabin-dashboard.glb.gz`: 9,798,606 bytes, SHA-256 `70036f4c17601909d4c382a0530501618dace139debb55cd966698e89b8b75f5`. Runtime URL: `/models/r35-cabin-dashboard-5c0a9dca.glb`.

The 19.2 MB UI disclosure is the decimal expanded model size. The checked gzip archive is not evidence of measured HTTP transfer compression.

## Authorship and bounded changes

The source package's deterministic `refine_dashboard.py` generates a recessed rounded stepped vent carrier, slender horizontal vanes, recessed guides, adjustment tabs and a continuous raised leather fascia lip fitted to the pre-existing triangle surface. Nissan's official 2024 US brochure, page 3, supplied a visual reference: https://www.nissanusa.com/content/dam/Nissan/us/vehicle-brochures/2024/2024-nissan-gt-r-brochure-en.pdf#page=3 . The two-vane arrangement is an original approximation, not a verified factory blade count. No photo pixels or new third-party meshes are included.

Only mesh 25, material primitives 13, 15, 17, 19 and 21 change geometry. The remaining 304 primitive buffers are byte-identical to the material input. The result retains 284 meshes, 309 primitives, 46 material definitions, all ten encoded images and textures, 653 nodes, hierarchy, transforms and eight pivots. All pre-existing node metadata remains; node 40 gains one geometry_refinement description. Triangle count is 508,950, down from 509,692. Exact geometry attribute bytes are 14,231,192 and index bytes are 3,192,132, totaling 17,423,324. Estimated RGBA image memory with mipmaps remains 18,524,848 bytes. These are asset/resource estimates, not measured hardware performance.

The source package preserves the accepted input, generator, deterministic rebuild verification, packed editable Blender import, and fixed-camera before/after Cycles renders. Its actual Three.js CPU-loader checks reported a 12.034 mm bound change for the targeted vent submesh and unchanged other submesh bounds. Those CPU checks and offline renders are not application WebGL evidence. The application lineage test independently pins the exact five changed primitives and all preserved metadata, materials and image identities.

## Remaining acceptance

Broad fascia proportions, generic door cards, side vents, several controls and rear framing remain approximate. Existing source attribution, native-metre placement, all eight pivots, the exterior-derived camera normalization and four-window thin-glass policy remain intact. The separate 82-mesh exterior was not a source input and is not changed by this increment.

This candidate requires the independently repaired runtime cleanup to pass first, followed by exact-source CI-only desktop/mobile app checks of entry, cancellation, retry, repeated exits, route/model changes, context loss, disposal counts, all seat views and pans. No local browser/socket proof, deployment, hardware frame rate, OEM accuracy or full-realism acceptance is implied.
