# Original cabin leather material increment

Source GLB SHA-256: 8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452. This is the existing original approximate cabin with contact AO and static illustrated instruments, not Nissan factory CAD. Existing lineage and attribution remain unchanged.

Only materials 0, 10, 13, 32, 34 and 35 change normalTexture.scale from 0.55 to 0.35. All other raw JSON and BIN bytes are exact, including roughness, colors, geometry, UVs, eleven images, transforms and controls. Six single-byte edits reduce the procedural normal amplitude; this artistic choice is not a measured factory finish. No renderer pass or texture is added.

Candidate GLB SHA-256: da354db8b3d40bc569e68262d121cc630f9bdf293c10b40071b6b46b0370b06a, 20,195,752 bytes. Canonical gzip SHA-256: 9fa0fc0b8eb05287e08e54bef81936954e91665f9e34fe95a7c9002aaf33e817, 10,194,086 bytes (two bytes larger than the source encoding). Build serves this checked-in canonical encoding; it does not recompress or introduce another encoder dependency.

Reproduce raw bytes with export_refinement.py --source ../r35-cabin-contact-ao-static-faces.glb.gz --output /your/output/cabin.glb --manifest /your/output/manifest.json. Python/zlib encoder versions are recorded in bytepatch-manifest.json; other compressor versions may produce different gzip bytes despite identical decoded GLB. The checked-in canonical gzip is hash-pinned.

Source/invariant tests do not prove visual improvement. Matched actual WebGL driver/passenger desktop/mobile images and preparation/resource ownership acceptance are required. Earlier performance limits and approximate cabin proportions remain.
