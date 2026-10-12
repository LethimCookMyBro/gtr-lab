# Original R35 cabin: constant-roughness diagnostic

This is a controlled experiment on the existing original approximate cabin, not an accepted final material or a factory specification. It uses the accepted `8645956f` AO/static-display model, never the rejected normal-only candidate.

Only red-leather materials 0, 10, 13, 32, 34 and 35 change: remove `metallicRoughnessTexture` and set `roughnessFactor` to `162 / 255 * 0.98` (0.6225882352941176), the original texture-domain median. Their metallic factors and the original map's blue channel are zero. Baseline normal strength remains 0.55. Colors, seams, AO, images, geometry, UVs and unrelated materials are preserved.

Exactly 324 bytes differ, confined to the six approved JSON field spans. All other bytes and offsets, including the entire BIN chunk and 11 images, remain exact. The sidecar manifest records offsets, preimages and encoder versions.

- Raw: 20,195,752 bytes; SHA-256 `6e7642a60783e4f17a65a223dad26a19d47f484f9f156bf7f574e5b1f2447c4b`
- Canonical gzip: 10,194,126 bytes; SHA-256 `b1051a18e9dba2a9352dbc0696c6469e1e2074f68fc82c7be6991d54928cd9ca`
- Wire size is 42 bytes above the canonical baseline

Reproduce from the repository root with Python 3.12.14 / zlib 1.3.2:

`python qa/cabin-preview/roughness-control/export_control.py --source qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz --output /tmp/r35-roughness-control.glb`

Other gzip encoder versions may produce different compressed bytes. Production preparation uses the checked-in canonical gzip and verifies both representations.

CPU checks preserve 505,664 triangles, 309 primitives, 46 materials and 11 shared image identities. Three Texture objects decrease from 62 to 50; six materials lose roughness/metalness-map defines. Controlled CPU program signatures increase from 10 to 11 because formerly shared red/charcoal variants separate. Rendering passes are unchanged, but shader workloads are not identical. These findings do not establish GPU performance.

The separate roughness comparison contract requires exact original browser body identities, matched native-completed desktop/mobile Driver/Passenger images and 11-image retirement. Reject flat, waxy, plasticky or inconclusive results. A passing evidence contract alone does not approve the material for release. Existing original-asset attribution and work-in-progress limitations remain applicable.
