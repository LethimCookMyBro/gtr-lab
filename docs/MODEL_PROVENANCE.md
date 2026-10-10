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

Any cabin added to this experience must be credited and described separately as an authored, reference-guided study fitted to this licensed exterior. It must not be represented as original Ciasny cabin geometry or a factory-accurate scan. The separate opt-in preview described below is an interim work in progress. It does not make the underlying exterior a verified complete Premium replica.

## Optional original authored cabin preview

The Premium configurator offers a separately loaded, original authored R35 cabin study. It is not Ciasny cabin geometry, official Nissan/OEM data, or a certified factory interior. Dashboard, console controls, steering assembly, seats, door cards and enclosed cabin surfaces have been authored as an approximation; some forms and material response remain generic. The other five variants remain photographic references without fake shared cabins.

The textured cabin retains the sealed spatial geometry: 309 primitives, 509,692 triangles, 653 nodes and eight pivots. Its exact GLB is 18,848,516 bytes, SHA-256 `0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83`. The repository retains its pinned 9,758,286-byte gzip at `qa/cabin-preview/r35-cabin-realism.glb.gz`; offline build preparation verifies both compressed and expanded hashes. The 18.8 MB disclosure describes the expanded model; actual network compression must be measured separately. The runtime URL is `/models/r35-cabin-realism-0b72bab4.glb`, so a browser with the older model cached still requests this exact revision. The older untextured sealed QA asset remains frozen. The cabin uses the existing exterior-derived normalization, including its camera eye points.

Ten embedded original images add authored fine leather/fabric normal and roughness variation, restrained console twill, steering seam marks and supplemental control legends. All 1,529,076 original triangle position/normal/UV corners are retained. The new maps use contiguous UV sets 0 through 3; no reference photograph pixels are included. GPU texture allocation is estimated at 18,524,848 bytes including mipmaps; geometry attributes and indices total 17,101,496 bytes. These are resource estimates, not measured hardware memory or frame-rate claims. See `qa/cabin-preview/REALISM_PROVENANCE.md` for authorship and retained badge attribution.

Only four reviewed window meshes receive temporary artistic thin-glass materials while the preview is active. On exit, cancellation, error or model change, the accepted opaque exterior window references are restored. Lamps, cowl, paint and other materials are outside that policy. Weak reflections and no physical refraction are known limitations of this thin-glass treatment. Doors, seats and instruments are not operational.

Driver, passenger and rear views have fixed eye points, clamped look controls and no translational navigation. The source camera contract is a visual-inspection contract, not occupant/ergonomic certification. Hardware performance, mobile frame rate, factory accuracy and completion of all six models are not claimed.
