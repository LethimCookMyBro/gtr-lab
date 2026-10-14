# Nissan Formula E catalog correction

Source baseline: `28f586ce35b4441254c10583fc7bc1da3265a106`. Verification date: 2026-10-13.

The sixth collection slot is Nissan e-4ORCE 05, GEN3 Evo, 2025/26 Season 12. The former GT500 slot was an incorrect catalog choice. `/configurator/gt500` remains an explicit unsupported entry with a collection link; it does not redirect to a different car.

## Factual evidence

- [Nissan Formula E press kit](https://global.nissannews.com/en/releases/nissan-formula-e-press-kit): e-4ORCE 05 identity, 2025/26 / Season 12, GEN3 Evo and its specification table.
- [FIA GEN3 Evo unveiling](https://www.fia.com/news/formula-e-and-fia-unveil-gen3-evo-race-car-capable-0-60mph-just-182s), 25 April 2024: 600 kW regeneration and AWD restricted to qualifying duels, race starts and ATTACK MODE.

The catalog shows 350 kW maximum traction power. It does not mistake the 600 kW regeneration capacity for propulsion. Torque and transmission are unspecified in these sources; no inherited V6, inline-four, road-car transaxle or dummy zero is inserted. No new speed, acceleration, weight or dimensional claim is needed by this bounded correction. Other five catalog entries are unchanged.

## Asset and presentation boundary

The entry now has a rights-cleared reference photograph: [TTTNIS’s 2024-25 Nissan GEN3 Evo](https://commons.wikimedia.org/wiki/File:2024-25_Nissan_Gen3_Evo.jpg), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The actual photograph shows the 2024/25 Season 11 car, separately from the fixed 2025/26 Season 12 catalog specifications. The short label “2024/25 GEN3 Evo reference” appears on the home invitation, collection, reference view, model details and switcher; Credits links author, source and license. The invitation says “View photos”.

The local file `public/images/nissan-gen3-evo-2024-25.jpg` is the unmodified Commons 1280 × 702 JPEG thumbnail: 246,734 bytes, SHA-256 `4aaf4aafbfffc1825d9ab403c356fdf89415cae58603e93a60e7b583e35e7b08`. It was retrieved and its pixels inspected on 2026-10-14; the exact Commons-returned download URL is recorded in `src/data/image-credits.json`. No synthetic image, unrelated asset or fake WebP path is used. No Formula E 3D asset has been acquired: its model URL remains null and 3D controls remain unavailable.

The old GT500 image files and credits remain retained as historical licensed material, not Formula E imagery. Closed historical QA records are not rewritten. README and current provenance describe the existing Premium behavior but do not claim new runtime acceptance: initial unified preparation, direct entry once ready, route-resident full cabin, exterior-window proxy, static instruments, and unverified physical-device performance.

## Verification boundary

CPU/DOM contracts cover the JPEG signature/checksum, the photo’s actual season, all five photo consumers, attribution links, unchanged first-five specifications, unknown torque, disabled 3D controls and the unsupported legacy route. Active navigation expectations identify the photograph; exact reviewed substitutions preserve the historical navigation contract. Old source-bound neutral-placeholder QA records remain historical and do not verify the photo revision.

No browser, listening socket, application server, deployment or asset publication was run locally for this photo revision. Current desktop/mobile layout and visual acceptance require authorized CI and actual screenshot review. Passing CPU/DOM tests or a build is not visual acceptance or completion of the six-vehicle experience.
