# GT-R LAB asset status

Research date: 2026-10-01. This is an asset acquisition record, not a legal opinion. A displayed Creative Commons label does not validate a re-uploader's ownership of a game asset. Preserve attribution, source links, license versions, and modification notices. Do not imply Nissan endorsement.

## Current verified delivery

- Six licensed photographs in `public/images/*.webp`, with 800px `.small.webp` alternatives
- Original JPEGs preserved in `asset-sources/images/`, outside the public web bundle
- Full credits: `public/images/credits.json` and `docs/IMAGE_CREDITS.md`
- Manufacturer-sourced facts: `docs/verified-specifications.json` and `docs/SPECIFICATIONS.md`
- WebP display set totals 1,061,980 bytes; small set totals 341,668 bytes, versus 15,880,199 bytes of original JPEGs
- All twelve WebP payloads successfully decoded and dimensions verified
- **Official Ciasny R35 exterior acquired and integrated for testing.** Source 40,477,960 bytes; optimized Meshopt/WebP asset 8,296,356 bytes with all 566,475 imported triangles retained. Exact custom aero and model-year limitations remain visible. No source cabin exists. See `MODEL_PROVENANCE.md`.

- Detailed-interior follow-up, paid-license restrictions, and public GLB provenance checks: `docs/MODEL_ACQUISITION_REVIEW.md`

## Six-variant 3D matrix

| Variant | Required model | Best current evidence | Blocker / next step |
|---|---|---|---|
| R35 Premium | Detailed stock R35 exterior with appropriate model year | Official Ciasny CC BY 4.0 GLB acquired. Its recognizable custom-aero R35 exterior is active on this route, clearly separated from the 2024 catalog specifications | Detailed cabin is absent and being authored from matched photographs. Actual-car browser/material QA pending. Not an exact 2024 Premium replica |
| R35 NISMO | Correct NISMO body, wing, wheels, vents | Search surfaced several downloadable Sketchfab models | Prominent candidates declare game-derived sources or carry contradictory provenance; no clean production-qualified asset found |
| T-spec | Correct body/year, wider front fenders, gold wheels, T-spec details | No exact clean free model established | Obtain an authorized exact model, or properly license and carefully adapt a compatible R35 base and label the adaptation |
| GT-R50 by Italdesign | Unique GT-R50 body, not a recolored R35 | Professional SQUIR model available commercially | Purchase not authorized; listed standard licenses may restrict distribution of the underlying model. Free candidate is a game-derived re-upload |
| NISMO GT3 | Exact competition generation / bodywork | vecarz listing displays CC BY but description disclaims originating ownership and prohibits commercial use | Conflicting license and third-party provenance. Excluded. Obtain an authorized original racing model |
| NISMO GT500 | Correct GT500 season and race body | Professional marketplace models exist; searches also surfaced unrelated Skyline GT500 and game models | No verified clean free R35 GT500 asset acquired. Do not substitute Skyline or a road R35 with a spoiler |

## Strongest realistic acquisition candidates

### 1. Ciasny — Nissan GTR R35

- Page: https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a
- Artist credited on the asset page: Ciasny
- Stated license: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Published: 2024-06-18
- Reported complexity: 566.6k triangles / 291.5k vertices
- Official public page confirms `source`, `gltf`, and `glb` archives exist
- Acquired through the official signed-in Sketchfab download menu on 2026-10-01; embedded author/source/CC BY 4.0 metadata verified. No protected viewer extraction or API key was used
- Source preserved unchanged; front/rear/side/inside renders and numerical geometry validation completed
- Optimized with retained exterior topology, exact paint/lamp/window/exhaust material separation, 2K WebP and Meshopt. Full provenance and hashes are in `MODEL_PROVENANCE.md`

### 2. Neubi / Neubi3D — Nissan GTR R35

- Model: https://blendswap.com/blend/11235
- Download page: https://blendswap.com/blend/11235/download
- Artist: https://blendswap.com/profile/1050
- Stated license: CC-BY-SA; the asset page does not identify a license version, so verify the downloaded license before publishing a derived GLB
- Blender 2.6x / Blender Internal; page lists 30 MB download. Author reports about 77 MB `.blend`
- Author describes original detailed modeling and explicitly says no interior is present
- Requires sign-in to download. No legitimate public original mirror was established
- Shortest unblock: user downloads the `.blend` through BlendSwap and supplies the associated license. Convert only after validating license and geometry
- Technical risks: very dense applied subdivision, old materials, no interior, possible gaps between body panels. Not automatically suitable for a close-up realistic configurator

### Other candidate with clean displayed license but unsuitable styling

- Moenthefields — Wide Body Nissan GTR: https://blendswap.com/blend/17732
- CC0 displayed; original artist describes their own widebody work
- Requires sign-in. Page lists 41.4 MB; community notes over 7 million vertices
- Widebody aftermarket model does not accurately represent Premium/NISMO/T-spec and requires optimization

## Investigated and excluded

- Ddiaz Design, 2017 Nissan GT-R NISMO: https://sketchfab.com/3d-models/2017-nissan-gt-r-nismo-71a34f4263ae43f59d4cd6b701899d20 — page says based on Need for Speed Heat; CC BY-NC-SA does not establish rights to redistribute the game geometry
- Ddiaz Design, 2024 Nissan GT-R NISMO: https://sketchfab.com/3d-models/2024-nissan-gt-r-nismo-20a14338df064c06a3606bab6894adbc — page says based on CSR2; excluded
- vecarz GT3: https://sketchfab.com/3d-models/gtr-nismo-gt3-wwwvecarzcom-5b5b07c776294f1ba0a045e0f5987316 — displayed CC BY conflicts with description banning commercial use and describing third-party Facebook/VK/MediaFire sources
- blakebella R35 GT V2: https://sketchfab.com/3d-models/nissan-gt-r-r35-gt-v2-2749e883ce5443d680c0fe104a6f37c4 — CC BY-NC-ND; modifications/configuration and unrestricted use not established
- Poly Pizza / David Sirera: https://poly.pizza/m/a_HKCtYAv2W — genuine CC BY 3.0 public GLB, 14.8k triangles; acquired and payload verified, but visual preview clearly depicts a stylized R34 Skyline, not the requested R35. Not placed in public assets
- Poly Pizza legal public file (only if an R34 stylized project is separately requested): https://static.poly.pizza/570c324d-029d-4cb1-b6fe-48a66a39d147.glb ; SHA-256 `01e98ff38b9e133a908671d9b4934a174e3223e997986e411038ea533962017c`
- Public GitHub `kunalshigam/nissan-gtr-story` contains a Black Edition GLB, but its model license credits Ddiaz Design and CC BY-NC-SA 4.0. Not used as a clean stock-asset source
- Public GitHub `SankalpJaiswal07/nissan-gtr-threejs` contains `public/nissan-gtr-v1.glb`; neither repository nor the GLB metadata establishes an asset license. Not used
- Public GitHub `pranavinod/NissanGTRModel` explicitly describes an R34 with basic geometry and placeholder material, not the requested R35
- Public GitHub `AAMutlu20/SOLIDWORKS_NissanGTR` is MIT-licensed but provides only `NissanGTR/Nissan.SLDPRT` (native SolidWorks part), with no GLB/GLTF/OBJ or established model-year/visual quality. Not a directly usable app asset
- Higgsfield read-only project inventory returned no projects. Catalog search requires a project ID; no project created and no generation or credit-spend operation performed

## Photograph caveats

- Premium image depicts a 2018 car, not the 2024 facelift
- NISMO and T-spec photos depict 2024 variants
- GT-R50 image depicts the 2018 concept, not the 2021 production car
- GT3 image depicts the 2015-spec Bathurst car, not the 2018 / 2020 EVO specification. Original is only 1080 × 720 and was not upscaled
- GT500 image depicts the 2020 No.23 MOTUL AUTECH car, matching the supplied 2020 NR20B specification

## Honest application behavior

Use the real photographs with visible credits while licensed detailed geometry is pending. A placeholder, unavailable model state, or a photo is not a completed 3D model. Never claim six authentic models are available when only a base geometry or none has been acquired. Do not relabel a road car as GT3/GT500 or a Nissan Skyline R34 as an R35.
