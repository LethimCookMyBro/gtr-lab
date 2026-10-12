# Original selector-cap normal candidate

This authored refinement changes only 115 preidentified normal rows on the existing composite surround and aluminum bezel. Geometry, UVs, materials, images, bevel/side/bottom normals and rendering passes stay unchanged. The two affected NORMAL accessors receive necessary max-Y metadata updates. See asset-manifest.json for complete byte-level scope and identities.

The cap is Y = intercept + 0.46Z -1.7X², with intercept 0.541 / 0.545; its analytic normal is normalize(3.4X,1,-0.46). The recovered original constructor and normal-generation source were transcript reconstructions rather than asserted byte-exact historical masters. Their equations and normal behavior were independently corroborated against the pinned accepted model. Original constructor SHA256 f1493dd080dc9cacc26693aa8cc37e010f61ee25d5978816f0f228d022514790; reduction-source SHA256 075e8b52fc6b008c2e90f296ac6f5eaefa7eb36c607784ae9c8e7fe171df0a9b.

Nissan's official 2024 Premium brochure page 3 was used only as a private visual reference for smooth formed trim: https://www.nissanusa.com/content/dam/Nissan/us/vehicle-brochures/2024/2024-nissan-gt-r-brochure-en.pdf#page=3 . No photograph pixels or third-party control meshes were copied. This remains an original approximate interior, without factory dimensional or accuracy claims.

Rebuild with Node and Python/zlib 1.3.2:

    node scripts/shifter-normal/build.mjs qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz /tmp/r35-shifter-rebuild

The encoder first proves the baseline gzip reproduces exactly. The baseline-compatible gzip is 58 bytes smaller; an alternate Node compression stream was rejected because it grew by 470,278 bytes. CPU artifact and ownership verification does not establish actual rendered improvement. Require matched native WebGL comparison and independent visual acceptance before release.
