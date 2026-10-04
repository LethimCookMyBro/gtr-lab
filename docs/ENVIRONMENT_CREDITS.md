# GT-R LAB outdoor environment credits

Verified and downloaded 2026-10-01 from Poly Haven. These are real photographic HDR panoramas, not AI-generated imagery or copied reference-site assets.

## License and provenance

Poly Haven states that its HDRIs are original works by its staff or artists who directly contribute their work, and releases the downloadable assets under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Commercial use, modification, and redistribution of the assets are permitted; attribution is appreciated but not required. See [official asset license](https://polyhaven.com/license).

The website separately protects example renders, user renders, logos and copy. No protected example render or thumbnail was reused. The included previews were derived locally from the downloaded CC0 HDR files.

Metadata and exact file URLs were read using the official public API (a uniquely named GT-R-LAB user-agent was used): [API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md). The shipped app self-hosts the downloaded files and does not depend on the live API. No paid asset, account, donation, purchase, generation, or credit-spend operation was used.

## Tief Etz — Forest road

- Author: Adrian Kubasa
- Source: https://polyhaven.com/a/tief_etz
- License: CC0 1.0 Universal
- Preview: `public/environments/tief_etz.preview.webp` (147546 bytes)
- Preview conversion: Derived locally from the downloaded 2K CC0 HDRI: resized to 1280×640, converted to sRGB LDR, WebP quality 82. High-dynamic-range highlights are clipped in the LDR preview. Use HDR for lighting, not this preview.

### 2K HDR

- Local: `public/environments/tief_etz.hdr`
- Source download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/tief_etz_2k.hdr
- Bytes: 6910630
- Radiance dimensions: `-Y 1024 +X 2048`
- MD5: `ebfcb9e8c46e4ca291c5208587e9884e` (matches official API)
- SHA-256: `8d0a727f19f54afe25160616c8c02f892c9c37e4c63a7979610a54a745a2e7bc`
- File changes: none; exact original published resolution

### 1K HDR

- Local: `public/environments/tief_etz_1k.hdr`
- Source download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/tief_etz_1k.hdr
- Bytes: 1700131
- Radiance dimensions: `-Y 512 +X 1024`
- MD5: `d41e4e8f61219d9aeef3b0e23d762ea0` (matches official API)
- SHA-256: `97f893e85dacb83fe2720066c00cd8e52e6334ea2491e83c8f19e60ba9dc1ecb`
- File changes: none; exact original published resolution

- Real photographed asphalt forest junction with guardrails and dense green woodland.

## Victoria Curve 01 — Coastal road

- Author: Greg Zaal
- Source: https://polyhaven.com/a/victoria_curve_01
- License: CC0 1.0 Universal
- Preview: `public/environments/victoria_curve_01.preview.webp` (71168 bytes)
- Preview conversion: Derived locally from the downloaded 2K CC0 HDRI: resized to 1280×640, converted to sRGB LDR, WebP quality 82. High-dynamic-range highlights are clipped in the LDR preview. Use HDR for lighting, not this preview.

### 2K HDR

- Local: `public/environments/victoria_curve_01.hdr`
- Source download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/victoria_curve_01_2k.hdr
- Bytes: 6435770
- Radiance dimensions: `-Y 1024 +X 2048`
- MD5: `d8d51a6f8321899c36fa34123ddcefa9` (matches official API)
- SHA-256: `ab6aa5152272864c9fcabf6675145bc8ed416bf55b4020c8032f1a78fd487d56`
- File changes: none; exact original published resolution

### 1K HDR

- Local: `public/environments/victoria_curve_01_1k.hdr`
- Source download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/victoria_curve_01_1k.hdr
- Bytes: 1612785
- Radiance dimensions: `-Y 512 +X 1024`
- MD5: `a81df79c34418139ff836ef289c2646f` (matches official API)
- SHA-256: `ae14c105f211badcaaea2d135478217bd3b55570c332fd80032b34adeb88c4ff`
- File changes: none; exact original published resolution

- Real photographed asphalt coastal bend/viewpoint, ocean on one side and rocky hills on the other.
- Contains a distant parked white car, benches and bins; preserve the photograph rather than generatively removing objects.

## Application notes

- Main files are 2K (2048×1024): 6,910,630 bytes forest and 6,435,770 bytes coast
- `_1k.hdr` alternatives are 1024×512: 1,700,131 bytes forest and 1,612,785 bytes coast
- Lazy-load only the selected environment; use 1K where bandwidth or memory is limited
- HDRs verified by Radiance magic/header, official file size, official MD5, and SHA-256. Both panoramas were decoded into local previews and visually inspected
- Both panoramas contain photographic ground. Align the car ground plane and environment rotation; a floating skybox alone does not create believable contact shadows or floor geometry
- Do not make the distant photographed white car in the coastal panorama look like a second interactive model
- Preserve the original HDRs for physically based lighting; use LDR previews only for selector cards/fallback presentation

## Reproducible build-time preparation

The four HDR binaries are intentionally excluded from Git. Their official HTTPS URLs, exact byte sizes and SHA-256 digests remain pinned in `public/environments/downloads.json`.

- `npm run prepare:assets` validates existing files or downloads missing/corrupt files from the pinned Poly Haven URLs
- `npm run build` runs that preparation before TypeScript and Vite; the verified files are copied into `dist/environments/`
- A cold checkout/build needs outbound HTTPS access to `dl.polyhaven.org`; no account, credentials, API key or runtime external request is required
- A warm build works offline if all four locally cached HDR files pass byte-size, SHA-256 and Radiance-header checks. Valid files are left untouched
- Default timeout is 120 seconds per file, including body transfer; optionally set `HDRI_FETCH_TIMEOUT_MS` to a positive integer for the build
- Downloads are bounded by their pinned size and published through a same-directory atomic rename only after verification. A failed fetch/check stops the build and leaves existing files intact
- Cross-host redirects, URL credentials, query tokens, non-HTTPS URLs and unsafe destination paths are rejected. A CDN/source change must be deliberately reviewed and repinned rather than silently accepted
- `npm test` includes deterministic fetch/validation tests using temporary directories and simulated network responses; no remote service is required for the unit suite

For local Vite development after a fresh checkout, run `npm run prepare:assets` once before `npm run dev`. To retain offline CI capability, a CI cache may preserve `public/environments/*.hdr`; cache entries are still validated on every build. Do not skip validation or commit unverified replacement files.

## Real-geometry replacement, 4 October 2026

The active configurator no longer projects either historical road panorama as a
floor or nearby scenery. The retained `forest` state ID now selects **Test
paddock**, an original fully modeled outdoor pit facility. `coast` selects an
original coastal road/turnout with real asphalt, curbs, sea wall, ocean surface
and modeled hills. The three indoor choices have original metre-scaled garage
or gallery architecture. These are original designed places, not scans of a
specific real circuit or building. The accepted vehicle geometry is unchanged.

All near/mid-distance scenery is geometry with positional parallax. Geometry
and bay/fence/road details are original project code. The only environment
photograph is a distant sky; it is never used as ground or nearby terrain.

New exact original 1K CC0 assets, verified 4 October 2026:

- Garage Floor: Jenelle van Heerden, https://polyhaven.com/a/garage_floor
  (diffuse/roughness/OpenGL normal; photographed tile about 1.886m)
- Concrete Wall 008: Charlotte Baglioni and Dario Barresi,
  https://polyhaven.com/a/concrete_wall_008 (three maps; tile about 2.71m)
- Asphalt Pit Lane: Dimitrios Savva,
  https://polyhaven.com/a/asphalt_pit_lane (three maps; tile 2m)
- Aerial Rocks 02: Rob Tuytel,
  https://polyhaven.com/a/aerial_rocks_02 (three maps; tile 50m, distant terrain)
- Kloofendal 43d Clear (Pure Sky): Greg Zaal,
  https://polyhaven.com/a/kloofendal_43d_clear_puresky (1K HDR sky-only edit)

License: https://polyhaven.com/license and CC0 1.0 Universal. Downloaded originals
were not modified. Color/normal intensity and metre-based UV tiling are adjusted
in the renderer. The maps are self-hosted with no runtime API dependency.
`public/environments/surfaces.json` and `downloads.json` preserve each exact
source URL, byte count and SHA-256. The twelve JPG maps and one HDR total
9,210,471 bytes. No paid assets, vehicle replacements or generated car images
were used. Legacy preview images remain documented above but are no longer
shown as selector thumbnails or scenery.

Build preparation verifies every asset, rejects noncanonical destinations and
redirects, and atomically publishes only complete checked files. A failed asset
load retains an asset-free interactive vehicle stage and exposes a recovery
notice. Browser screenshots must be reviewed separately from geometric tests;
SwiftShader is not physical-device performance or OEM-photoreal acceptance.


### Visible partly-cloudy sky refinement

The final active sky candidate is **Kloofendal 48d Partly Cloudy (Pure Sky)**,
Greg Zaal (original) and Jarod Guest (sky edit), CC0:
https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky

The exact2K original is5,451,493 bytes; upstream MD5
`2eba3a4d7eeb23cbfbeca364c97e7980`, SHA-256
`5244534e9cf5b606f2ff513aa00ddb161b0a4826ffd88a0d3bd03ac29247d198`.
Its visible clouds are the actual distant sky photograph, not a ground panorama.
The directional sun and water highlight direction match the decoded HDR sun.
The earlier clear-sky candidate is retained only in this change history.

The visible sea now uses a demand-rendered planar reflection and original Fresnel/
wave shader. Its128² normal field is original deterministic mathematical wave
code; no external image was extracted or generated. A512² reflection target
captures the real camera-visible scene. It has no animation loop or idle frame
invalidation, and all owned GPU resources are explicitly disposed.
