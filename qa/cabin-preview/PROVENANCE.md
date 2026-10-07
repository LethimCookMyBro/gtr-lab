# Repaired and batched cabin preview

The cabin geometry was authored for GT-R LAB as an original visual reconstruction. It contains no downloaded cabin model, OEM CAD, scanned reference photographs or photograph-derived textures. The separate cabin GLB contains no images. Cabin surfaces, controls and dimensions remain approximations; this is not an official Nissan model or a factory-certified Premium replica.

The candidate repairs ten original cabin closure panels, retunes authored PBR material values and batches static opaque geometry within retained pivot scopes. This revision additionally insets closure surfaces that previously protruded beyond the retained exterior and provides a spatially capped grouping variant alongside a same-source global-material control. The two variants share source geometry and material definitions; grouping alone differs. It preserves original named handles; a batched semantic handle must be detached through the supplied private component-access API before independent visible mutation. Door motion, seat travel, working instruments, collision-resolved movement and VR are not supplied by this preview.

The two steering-hub badge components now adapt GTR logo_Red_0 and GTR logo_Metal_0 from the already accepted Ciasny exterior listed below. Changes: world-space extraction, resizing to 46 mm width, flattening to 0.7 mm depth, orientation/placement on the steering hub, and reinterpreted enamel/metal PBR values. This is licensed model geometry, not authenticated OEM badge geometry. The copied components retain the following CC BY 4.0 attribution; the separate exterior input remains byte-identical.

Original material choices were informed by page 3 of the official 2024 Nissan brochure: https://www.nissanusa.com/content/dam/Nissan/us/vehicle-brochures/2024/2024-nissan-gt-r-brochure-en.pdf#page=3. Reference images and their pixels are not embedded or redistributed.

## Retained exterior

The preview reuses the already published exterior file without changing its bytes.

- Title: Nissan GTR R35
- Artist: Ciasny, https://sketchfab.com/Ciasny
- Model: https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Existing adaptation: normalized transforms, separated lamp/window/exhaust materials, 2K WebP textures, generated tangents and Meshopt compression
- Preview treatment: existing app paint/light adaptation, plus independent inspection materials for exactly four confirmed exterior window roles

The exterior has custom aero and is not a verified stock 2024 Premium body. No endorsement by Nissan or Ciasny is implied. The exterior's CC BY license does not purport to license Nissan trademarks or the separately authored cabin.

Three.js 0.180.0 is used under its MIT license. Preparation retains the Three.js license beside generated viewer dependencies. No source photographs are included or redistributed.
