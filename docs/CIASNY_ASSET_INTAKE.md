# Ciasny R35 intake and cabin references

Verified 2026-10-01. Selected route: inspect Ciasny's licensed R35 exterior, retain any suitable existing cabin, and author missing cabin geometry from real-car references. The official 4K GLB was acquired through Sketchfab’s signed-in download menu on 2026-10-01. Its embedded asset metadata confirms Ciasny, the model URL and CC BY 4.0. Geometry inspection confirms that the source is exterior-only; a new cabin is being authored separately.

## The concrete download

- **Model:** [Nissan GTR R35 by Ciasny](https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a)
- **Price:** free
- **License:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode.en)
- **Verified public metadata:** 566,557 triangles, 291,526 vertices, 20 materials, five textures, no animations; downloadable flag true. [Official public metadata](https://api.sketchfab.com/v3/models/51c912a8310c4e00a82ad7673d84228a)
- **Authorship evidence:** the publishing [creator profile](https://sketchfab.com/Ciasny) describes a Blender car-modeling practice. The listing presents this as the creator's model; no conflicting source was found. Inspect the original archive's metadata and notices before integration rather than treating the profile as proof of every included texture's origin.
- **Acquired source:** official GLB, 40,477,960 bytes; SHA-256 `c2bb4967ef2648f8f8bbb27ad1e97d99e3148e34d114f3c9f0cac4f27c690dc4`. Preserved unchanged outside the public app. No API keys were used.
- **Embedded metadata:** generator Sketchfab-16.16.0; author Ciasny (https://sketchfab.com/Ciasny); license CC-BY-4.0; title Nissan GTR R35; source URL matches the listing.
- **Imported geometry:** 82 mesh objects, 566,475 triangles in Blender, 20 source materials. No seats, dashboard, steering wheel or other cabin geometry is present. Source glass is dark and near-opaque. Separate body paint and emissive lamp materials exist, but the exhaust shares paint and white lamp materials span front/rear parts; those bindings are being separated before integration.

The public 1920px preview establishes a realistic R35 exterior. Faint seat/cabin forms can be seen through dark glazing, but the preview does not establish a detailed dashboard, console, door cards or rear seats.

## What CC BY 4.0 permits

The official legal code, §2(a)(1), permits reproduction and sharing of the licensed material and adaptations. Section 2(a)(4) permits all media/formats and necessary technical modifications. Those grants cover conversion, optimization, new cabin additions and public GLB delivery for a WebGL viewer, insofar as Ciasny owns the included material. This license does not require preventing users from downloading the model, and it has no ShareAlike condition.

Section 3(a) requires appropriate creator attribution, retained copyright/license/warranty notices if supplied, a source link where practicable, a license link, and identification of modifications. Section 2(a)(5) bars downstream restrictions that prevent exercise of licensed rights. Section 2(b)(2) does not grant trademark rights; attribution must not imply Nissan or the creator endorses GT-R LAB.

Suggested credit after the work is actually performed:

“Nissan GTR R35” by Ciasny, via Sketchfab, CC BY 4.0. Modified for GT-R LAB: [list actual geometry, cabin, material and optimization changes].

Link the model title, creator and license in the app's credits, include the same credit alongside the delivered file, and retain supplied notices in asset metadata. Keep any newly authored cabin's authorship separate and accurate.

## Exterior generation: provisional, not an exact model-year claim

The preview's V-shaped upper grille surround, hood lines and front-fascia treatment are consistent with the **2017-era facelift**. Nissan describes the enlarged V-motion grille, revised hood, front bumper and pushed-out sills in its [2017 press kit](https://usa.nissannews.com/en-US/releases/us-2017-nissan-gt-r-press-kit) and [European launch description](https://europe.nissannews.com/en-GB/releases/2017-nissan-gt-r).

This is a visual inference from one front three-quarter image. It does not establish a specific model year, Premium/NISMO/Track trim, or factory-correct specification. Carbon-look trim, dark mirrors, wheels and spoiler could be modifications. Confirm the grille, rear bumper, wing, wheels and archive naming from the supplied mesh before choosing a label. Do not relabel the same mesh as all six variants.

## Cabin reference shortlist

1. **Primary LHD layout: official 2017 Nissan brochure, PDF page 3.** [Brochure](https://es.nissanusa.com/content/dam/Nissan/us/vehicle-brochures/2017/2017-nissan-gtr-brochure-en.pdf#page=3). Visually inspected: steering-wheel spokes and controls, instrument binnacle, horizontal dashboard, center display, rectangular center vents, round side vents, shifter surround, media controller, handbrake, passenger door card and front-seat profile. Page 5 supplies factory trim/seat color references. Use it for factual geometry and layout reference; redistribution of Nissan's brochure images as app assets has not been cleared.
2. **2017 Premium RHD full cabin, photographed at Nissan's own gallery.** [Photo](https://commons.wikimedia.org/wiki/File:The_interior_of_Nissan_GT-R_Premium_Edition_2017_year_model_at_Nissan_Global_Headquarters_Gallery.jpg). Tokumeigakarinoaoshima; 19 February 2017; 2560 × 1920; **CC BY-SA 4.0**. Visually inspected: complete dashboard, door-card handle shape, wheel, pedals, sculpted seat cushions/bolsters, console and material transitions. This is right-hand drive. Preserve real LHD/RHD differences rather than mirroring labels, controls or asymmetric console details.
3. **Matched center-console detail.** [Photo](https://commons.wikimedia.org/wiki/File:The_center_console_of_Nissan_GT-R_Premium_Edition_2017_year_model_at_Nissan_Global_Headquarters_Gallery.jpg). Same photographer/date, 2560 × 1920, **CC BY-SA 4.0**. Useful for the shifter, setup switches, start button, media controller, handbrake and cupholder arrangement. File-page license verified; see the photo itself before implementing its small details.

If Commons photos or crops are redistributed, retain author/source/license attribution and license adapted images under CC BY-SA 4.0. Model materials should be authored separately; do not silently bake a copyrighted brochure photograph into a texture.

The official 2017 press kit confirms an 8-inch display, reduced center-stack controls, wheel-mounted shift paddles, a console media controller, a four-passenger layout, and the central tachometer/gear display. Those distinguish this cabin from the earlier R35 layout. Premium and NISMO seat upholstery/steering-wheel finishes differ, so start with the chosen trim rather than mixing them.

## Intake and acceptance checklist

- Preserve the supplied original archive; record source URL, creator, download date, file sizes and SHA-256. Inspect bundled license, notices and texture origins.
- Validate the container and import it without executing embedded scripts. Confirm linked textures are present, scale/axes are sensible, and no unexpected external resources are required.
- Render front, rear and side views before modification; compare recognizable R35 features to the generation reference. Record the actual trim confidence.
- Inspect inside with suitable glazing and interior lighting. Inventory dashboard, wheel, gauges, vents, console, front/rear seats, door cards, pedals and roof lining. Reuse only the parts that exist and meet quality requirements.
- Choose and retain one steering side. Fit any authored cabin to the actual windows, firewall, seat positions and door openings. Judge silhouette and proportions before adding tiny controls.
- Capture a seated driver's view, passenger view, door-open/side view and rear-seat view. Verify plausible clearances, readable instruments, correct face orientation and no visibly unfinished cabin surfaces.
- Validate the optimized GLB in a WebGL-capable browser: load failure handling, material/glass appearance, orbit/cabin controls, lighting, mobile cost and no exterior/interior clipping. Technical validation alone is not visual acceptance.

## Other routes

Neubi's [original BlendSwap R35](https://blendswap.com/blend/11235) explicitly says the interior does not exist, so it does not solve the cabin need. Paid research is paused. For accuracy, [3DExport's license](https://3dexport.com/basic-license-and-extended-license) permits web-app embedding in principle, while also restricting exposure of reusable model files; it should not be described as prohibiting all web use.
