# Remaining authentic variant assets: free-only qualification

Research checkpoint: 2026-10-01, 09:50 UTC. **Car assets must be free.** Paid models, paid subscriptions, seller contact, new accounts and authentication retries are outside this sourcing task. No new car archive was acquired in this pass. This is a bounded qualification result, not a claim that no suitable free model exists anywhere.

The six-vehicle requirement remains open. The integrated Ciasny exterior is an accepted custom-aero R35 with unverified exact trim/year. It is not six factory variants. Both the early original exterior and the later newly authored cabin studies were rejected; neither is an approved base for new work. Targeted changes to an accurate, licensed exterior are allowed, but they must produce the real variant's geometry and pass visual review.

## Actionable shortlist and present gaps

| Target | Best free route / evidence | Present result and smallest next step |
|---|---|---|
| R35 Premium | Acquired [Ciasny R35, CC BY 4.0](https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a); actual source and deployed mesh inspected | Lawfully editable and publicly distributable with attribution. Custom aero must be corrected against a specified Premium year. A color change does not make the existing mesh factory Premium. |
| NISMO | [NznCG, 2022 NISMO Special Edition](https://www.cgtrader.com/free-3d-models/car/sport-car/nissan-gtr-r35-nismo-special-edition-2022), free creator listing | Strongest additional exterior. Official Free Download opens a login modal. No cabin supplied. Public GLB delivery is not cleared under the present license/application design; see below. Alternatively author the actual NISMO parts on Ciasny and validate them. |
| T-spec | No qualified free, original-author T-spec archive found in this pass | Ciasny is a plausible road-car base only after precise stock-body corrections, wider front fenders, correct wheels/brakes and trim-specific interior. Needs geometry work and acceptance, not a relabel. The Sketchfab “2018 Spec-T” upload has no established original authorship and does not establish a factory-year match. |
| GT-R50 | dev365th's self-made low-poly GT-R50 (Sketchfab ID `ac218bdafe1f4015b9fe49fd375edd93`) is an original free lead, but its 4,424-triangle stylized preview fails the required realism | No qualified realistic free mesh. ChironArt's precise source/license remains unverified; known realistic free reposts have CSR2 provenance. A standard R35 with trim changes is not a GT-R50. |
| GT3 | [Free CGTrader print-model lead](https://www.cgtrader.com/free-3d-print-models/miniatures/vehicles/nissan-gt-r-nismo-gt3), creator vishnu-venu14 | Unqualified: Editorial (no AI), 1.46 MB OBJ advertised, no original-modeling evidence or cabin evidence; buyer reports a file problem and author replies that Max 2014 is needed. No verified professional original free GT3 was established. |
| GT500 | Known free R35 listings retain unresolved game-model provenance | No qualified original free mesh. Treat GT500 as a separate race-body task. A road-car wing, decals or uniform scaling cannot establish the correct race car. |

## NznCG: exact acquisition and license result

Original listing: model **#3846903**, published 2022-07-01. It describes creation in Blender 3.0/Cycles, a detailed exterior, separate objects and unapplied modifiers. The listing explicitly states **“Interior not included.”** It advertises Blender 187 MB, FBX 35.3 MB, OBJ 104 MB and STL 65.5 MB, with 290,833 base polygons / 690,706 subdivided polygons. Materials require conversion outside Blender; texture files are provided. The professional exterior preview was visually inspected in the earlier pass.

On 2026-10-01 the official **Free Download** button was inspected in the cloud browser. Clicking it opened the **Welcome back** login modal. No sign-in, account creation, credentials, agreement acceptance or archive download followed. The shortest acquisition step is the user's normal official free download of the Blender archive and textures from the linked page. That alone would not resolve runtime distribution.

Current [CGTrader terms](https://www.cgtrader.com/pages/terms-and-conditions): §24 applies the seller-selected license to free downloads; this listing selects Royalty Free (no AI). §§21A.2–4 permit adaptation and incorporated application use, with limits on standalone access and commercially reasonable extraction safeguards. §21A.5 permits a broader written grant. This is not a blanket prohibition on web applications.

The exact No-AI restriction in §21B.1 is **“Product use for machine learning or training of neural network models, including generative AI models, is not permitted.”** It does not expressly establish a ban on ordinary assistant-directed deterministic Blender editing. Do not replace this wording with Sketchfab's different NoAI wording or describe ordinary AI-assisted coding as prohibited. CGTrader's [current help article](https://help.cgtrader.com/hc/en-us/articles/46191349842705-Can-my-models-still-be-licensed-for-AI-training) discusses training rights specifically.

### Concrete delivery limitation

The current project has **no existing private runtime asset route**: `scripts/prepare-models.mjs` reconstructs a normal GLB from public `modeldata/` chunks, then Vite copies it to the public site. Both routes expose reconstructable model bytes. Checksum pinning, Meshopt compression, renamed chunks, omission of a download button, or keeping only the original `.blend` outside Git does not turn this into an extraction safeguard.

Keeping source archives outside the repository is useful, but the deployed GLB remains retrievable. No already implemented, license-cleared delivery option for the NznCG mesh was found. Do not invent credentials or add token-based access merely to call a public viewer private. Private local inspection/rendering is a different use and would not complete the requested public interactive experience.

The precise unresolved permission is a grant allowing this project's optimized/adapted model to be delivered to ordinary browsers as technically retrievable GLB data, with no standalone asset-download product; if raw chunks are to stay in public Git, that grant must separately cover public source redistribution. Alternatively the rights holder must approve a specific real extraction-safeguard design. No seller has been contacted. Until that is resolved, **do not add NznCG bytes to `modeldata/`, `public/`, GitHub or the deployed site**. Ciasny's CC BY route does not have this stock-license delivery ambiguity.

### Cabin derivatives checked

- The credited [LFS FLPP TRACKY derivative](https://www.lfs.net/files/vehmods/24568F) points to NznCG's source and explicitly does not allow derivatives. It is not a freely reusable cabin source.
- [Maximilian Rötzler's Unity shader showcase](https://maxroetzler.artstation.com/projects/AZE9xz) credits NznCG and describes retexturing. It provides no qualified cabin archive or broader license.
- No original-author, free, full-cabin derivative was established. Do not infer cabin availability from tinted windows or another creator's rendered scene.

## What Ciasny's actual mesh supports

Read-only inspection covered the original 40,477,960-byte GLB and deployed 8,296,356-byte GLB. Both expose **82 exterior meshes**; the source has 566,475 triangles. It is triangulated display geometry, not a verified editable factory CAD surface. The inspection confirms component separation, not dimensional or trim accuracy.

| Actual source mesh | Triangles | Consequence for variant work |
|---|---:|---|
| `Front Bumper_CarPaint_0` | 8,786 | Main painted fascia can be replaced separately; associated grids, lights and trim are separate too. |
| `Hood_CarPaint_0` / `Hood Vents_Plastic_0` | 3,282 / 7,156 | Hood and duct inserts are separately addressable. Correcting ducts still needs geometric work. |
| `Doors_CarPaint_0` / `roof_CarPaint_0` | 4,336 / 1,060 | Road-car surfaces can be retained when verified against the chosen reference year. |
| `Back Body_CarPaint_0` / `Rear Bumper .001_CarPaint_0` | 7,390 / 7,918 | Rear body and bumper surfaces can be edited separately. |
| `Spoiler_Carbon Fiber_0` | 1,660 | An actual variant-specific wing can replace the current custom wing. |

There is no separately named front-fender object. Fenders must be positively located in the triangles before planning a simple swap. Wheel/brake objects use several generic `Brakes_*` names; those names alone do not identify the correct wheel design. No cabin meshes are present.

**Feasibility judgment:** Premium, T-spec and NISMO are the defensible candidates for targeted modifications of this road-car base, conditional on a fixed reference year, correct replacement parts and side-by-side review. That is a modeling task, not a claim that any of these exact variants already exist in the file. The stock Premium corrections should be accepted before building the two trim derivatives.

Year matters. The current factual catalog cites **2024 US** road cars, while NznCG is **2022**. Nissan's [2024 press kit](https://usa.nissannews.com/en-US/releases/2024-nissan-gt-r-press-kit) documents revised fascias, grilles and wings across the range; the NISMO additionally has a swan-neck rear wing and revised lip, diffuser and canards. T-spec requires wider front fenders, gold RAYS wheels, carbon-ceramic brakes and Mori Green cabin treatment. Select the year explicitly and update the specifications if the accepted geometry uses another year.

[Italdesign's original GT-R50 description](https://www.italdesign.it/en/project/gt-r-50-by-italdesign/) specifies a roof 54 mm lower than its production base and redesigned lamps, rear window/body structure, floating rear light rings and 21-inch wheels. Those changes span most visible body surfaces. The file's separable roof and hood do not make a small GT-R50 conversion feasible. For race variants use the actual [NISMO GT3 technical material](https://www.nismo.co.jp/en/products/customerracing/) and [2020 R35 GT500 specification reference](https://www.nismo.co.jp/motorsports/SUPERGT/2020/machine.html); GT500 must not inherit the road car's drivetrain/cabin representation.

Under [CC BY 4.0 §§2–3](https://creativecommons.org/licenses/by/4.0/legalcode.en), the Ciasny asset may be adapted and shared, including public WebGL delivery, while preserving required credit, source/license notices and an accurate changes statement. That license does not certify a factory trim or transfer Nissan trademark rights. Keep any separately sourced part's provenance and license as well.

## Exclusions to preserve

- DRIVER-FIRE NISMO `3ada6685647f46d99f53e3d41251d2d4`: listing says Project Cars 3 rip.
- Ddiaz GT-R50 `ba309062dc6046eda99dd291c1d5e8e5` and GT3 `1061f7970dc84b6dad0a363540fbc102`: descriptions identify CSR2 geometry.
- OUTPISTON GT-R50 `1fe950a737c842ee9665e26c944a58ad`: CSR2 tag and unresolved ownership.
- JUSTGAME R35 GT500 `e10f1639a08a409a939e9e926c0c7f5c`: GT Sport references and unresolved authorship. Its older Skyline/300ZX GT500 uploads are also the wrong vehicle generation.
- Tyler_Dave GT3 `7497eb706fc046a2ab39a4af1ea57bb8` and MattDoesBlender GT3 `574ae0eb69ec45668a9eee9d427ba941`: their public profiles describe using others' models; original geometry rights were not established. A CC label alone does not clear the underlying game/reposted mesh.
- [ChironArt/ThongCG GT-R50](https://thongpham.artstation.com/projects/8B3edq): the earlier exact-page inspection stopped at Epic verification. [Resume](https://thongpham.artstation.com/resume) describes compiling/sharing; original authorship and the model's redistribution grant remain unknown. No verification bypass or author contact was attempted.
- Earlier paid leads NM3D T-spec, Phazan GT-R50, gakuyajima GT3 and 3DModels.org GT500 are **out of scope under free-only**, irrespective of their quality. Do not resurrect them as acquisition steps.

## Acceptance before adding another named variant

Choose the actual model year; retain original source/license evidence; inspect the downloaded geometry; compare front, rear, side, top and cabin views against that year's authoritative references; verify distinct physical parts and a plausible scale; credit all adaptations; then optimize and test the exact accepted file. Show a newly authored cabin or major body modification for acceptance before integration. Keep unavailable variants unavailable until those checks pass.
