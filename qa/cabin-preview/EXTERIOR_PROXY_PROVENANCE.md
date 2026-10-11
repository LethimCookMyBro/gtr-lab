# Exterior-window cabin proxy

This is a lightweight, opaque, static derivative of the approved original-authored dashboard cabin. It fills the exterior car's windows while the viewer is outside. It must never replace the detailed, operable inside-view cabin. The original full cabin and its compressed input remain byte-identical.

## Exact identities

- Source full cabin: `r35-cabin-dashboard.glb.gz`, expanded SHA-256 `5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326`, 19,170,816 bytes. See [dashboard provenance](DASHBOARD_GEOMETRY_PROVENANCE.md).
- Proxy compressed source: `r35-exterior-cabin-proxy.glb.gz`, 616,928 bytes, SHA-256 `bd14ba078e08d762158fb3fcc225acae6d2369b7d2c1f2ad1a128f404147733e`.
- Expanded proxy: 956,368 bytes, SHA-256 `49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347`.
- Runtime output: `/models/r35-exterior-cabin-proxy-49d7c2ab.glb`.
- [Frozen source verification](exterior-proxy-verification.json) records geometry totals and native bounds. Its gzip size is a local archive measurement, not observed HTTP transfer size.

The later static instrument atlas is not a source input. No new downloaded meshes, photographs, textures or licensed assets were introduced. Existing cabin provenance and original exterior attribution remain applicable; the separate Ciasny exterior was not modified or included in this proxy.

## Authored reduction and reproducibility

The private authoring package imports the exact source into Blender, bakes original object matrices into native-metre positions, removes fine stitching, printed markings and badge-detail faces, welds coincident vertices, and decimates retained surfaces. Seats, dashboard, wheel, floor, parcel shelf, door cards and opaque closure surfaces remain. Eight constant-color material batches replace detailed material and texture variants. Source part names and triangle ranges remain in the proxy node metadata.

The result contains 37,749 triangles, eight mesh nodes, eight primitives and eight materials. It has no textures, images, UVs, animations, skins, cameras, lights, exterior mesh, duplicated windows, ground plane or shadow catcher. Small controls, badges, stitching, fabric response and local detail are intentionally absent or approximate.

The authoring package retains editable geometry arrays in a canonical source and a deterministic exporter that reproduces the frozen proxy hash. Blender decimation itself is not byte-deterministic across fresh authoring runs; a fresh reduction is a new candidate. This application build does not rerun Blender or simplify geometry. `node scripts/prepare-cabin.mjs` verifies compressed hashes, bounds decompression, reconstructs the exact two reviewed GLBs, validates raw identities and native proxy geometry, and writes each output atomically. The existing `prepare:assets` command already includes this step.

## Coordinates and runtime contract

Coordinates remain glTF X lateral, Y up, Z forward, in metres. Source transforms are baked because this asset is static. There is no proxy-only recentering or rescaling. Global used-vertex bounds differ from the source by at most 0.000512362 m. The source package's maximum sampled one-way source-vertex-to-proxy-surface distance is below 0.010 m; this is not an exhaustive Hausdorff bound or watertightness proof.

- Apply the same exterior-derived normalization once to both cabin assets: scale = 4.7 / max(exterior width, exterior length), position = [-centerX × scale, -minY × scale, -centerZ × scale]. Never normalize from proxy bounds.
- Replace full/proxy visibility atomically. Never draw overlapping full and proxy cabin surfaces.
- One owner controls the four preview glass meshes; lamps and other exterior material roles remain separate. Proxy failure retains the opaque exterior fallback.
- Runtime must explicitly keep every proxy mesh's castShadow and receiveShadow false. GLB extras express intent but do not enforce renderer flags.
- The full interior retains its eight original pivots and detailed controls. The proxy only contains eight static batches.

## Evidence limits

Checksums, CPU geometry checks and source offline window comparisons establish artifact identity and a bounded geometry contract. They do not demonstrate app WebGL performance, fixed flicker, physical-device frame rate, every-angle clearance or final visual acceptance. Actual runtime checks of entry/exit, delayed requests, cancellation, replacement ownership, route/model switches and disposal remain required. Existing source visual approximations also remain.

This private integration preparation does not publish or deploy any asset.
