# GT-R R35 model provenance

## Licensed exterior

“Nissan GTR R35” by [Ciasny](https://sketchfab.com/Ciasny), obtained from the creator's [Sketchfab model page](https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a) under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Original download: 40,477,960 bytes. SHA-256: `c2bb4967ef2648f8f8bbb27ad1e97d99e3148e34d114f3c9f0cac4f27c690dc4`. The original download was retained unchanged.

This is the artist's custom-aero R35 interpretation. It is not represented as an exact model-year/trim match or an official Nissan model. Any factory specifications presented separately describe the stated specification reference, not a measurement of this mesh.

## Web adaptations

- Baked transforms and normalized to 4.7 m length, a grounded origin, +Y up and +Z forward
- Retained all 566,475 source triangles and all 82 exterior mesh objects without geometric simplification
- Separated exhaust metal from the paint material, so body recoloring does not recolor the exhaust tips
- Split cabin glazing from lamp covers and front emitters from reverse-light emitters into exact semantic material roles
- Generated MikkTSpace tangents for normal-map consistency
- Resized texture maps to a maximum of 2,048 pixels and encoded them as WebP
- Applied Meshopt geometry compression and quantization

The exterior web asset is 8,296,356 bytes, SHA-256 `fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d`.

## Verified asset properties

- Source license, author and URL are embedded in the original download
- Attribution and a changes statement are embedded in the web asset
- Khronos glTF validation: zero errors and zero warnings
- Meshopt-decoded numerical validation: no non-finite accessor values
- Preserved source triangle count: 566,475
- Front, rear and side renders were inspected for the silhouette, hood vents, lamps, badges, wheels, wing and exhausts

The validator reports informational notices for optional unused attributes and its lack of native Meshopt validation. Meshopt decoding was tested separately.

## Cabin limitation

The licensed source contains an exterior shell and wheels, with no dashboard, steering wheel, instruments, center console, seats, door cards, cabin floor or roof lining. Its opaque-looking glazing hides that empty shell.

Any cabin added to this experience must be credited and described separately as an authored, reference-guided study fitted to this licensed exterior. It must not be represented as original Ciasny cabin geometry or a factory-accurate scan. Interior controls remain disabled until the added cabin is rendered and checked.
