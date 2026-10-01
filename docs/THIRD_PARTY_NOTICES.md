# Third-party software and font notices

Reviewed 2026-10-01. [Complete distribution notices](../public/THIRD_PARTY_NOTICES.txt)
will be copied by the next Vite build to `/THIRD_PARTY_NOTICES.txt`. Link this file from the
website's Credits & sources page when publishing. Existing media attribution
is unchanged: [photographs](IMAGE_CREDITS.md), [environments](ENVIRONMENT_CREDITS.md),
[vehicle provenance](MODEL_PROVENANCE.md), and [font license](FONT_LICENSE.txt).

This records licenses of third-party components. It does not select or grant
a license for GT-R LAB's original code or media.

## Verified runtime inventory

| Component | Installed version | Declared license | Distribution role |
| --- | --- | --- | --- |
| `@babel/runtime` | 7.29.7 | MIT | Emitted runtime code |
| `@fontsource-variable/dm-sans` | 5.3.0 | OFL-1.1 | Self-hosted font and CSS |
| `@monogrid/gainmap-js` | 3.4.0 | MIT | Emitted runtime code |
| `@react-three/drei` | 10.7.9 | MIT | Emitted runtime code |
| `@react-three/fiber` | 9.8.1 | MIT | Emitted runtime code |
| `fflate` | 0.6.11 | MIT | Emitted runtime code |
| `its-fine` | 2.1.1 | MIT | Emitted runtime code |
| `lucide-react` | 0.468.0 | ISC | Emitted runtime code |
| `meshoptimizer` | 0.22.0 | MIT | 0.22 decoder vendored by Three.js; installed 0.22.0 license |
| `react` | 19.3.0 | MIT | Emitted runtime code |
| `react-dom` | 19.3.0 | MIT | Emitted runtime code |
| `react-router` | 7.18.4 | MIT | Emitted runtime code |
| `react-router-dom` | 7.18.4 | MIT | Direct re-export package for React Router |
| `react-use-measure` | 2.1.7 | MIT | Emitted runtime code |
| `scheduler` | 0.28.0 | MIT | Emitted runtime code |
| `suspend-react` | 0.1.3 | MIT | Emitted runtime code |
| `three` | 0.180.0 | MIT | Emitted runtime code |
| `three-stdlib` | 2.36.1 | MIT | Emitted runtime code |
| `use-sync-external-store` | 1.7.0 | MIT | Emitted runtime code |
| `zustand` | 5.0.15 | MIT | Emitted runtime code |

The build also emits Vite 7.3.6 browser preload helpers and Rollup/CommonJS
helpers. Their exact license text is retained from `node_modules/vite/LICENSE.md`.
The React MIT notice additionally covers React reconciler code embedded in
Fiber's distribution, identified by its existing Meta copyright headers.

## Notices that package-name lists would miss

- Lucide's complete ISC notice includes attribution for Feather-derived
  portions to Cole Bemis. The exact installed notice is preserved
- Three.js vendors the Meshopt 0.22 decoder separately from its own license;
  its Arseny Kapoulkine copyright and MIT license are preserved
- `three-stdlib`'s emitted EXRLoader retains TinyEXR/Syoyo Fujita and
  OpenEXR/Industrial Light & Magic BSD-style conditions in the installed source
  map. Those full upstream notices are preserved, including original comment
  markers; the package's top-level MIT label alone does not replace them
- `@monogrid/gainmap-js/dist/third-party.txt` is preserved in full, including
  its MIT and Apache-2.0 notices. Some entries concern optional upstream worker
  entrypoints; this record does not claim that the application activates them
- The DM Sans OFL-1.1 copyright and license are included in the public asset set
  to accompany the font in the next build;
  the existing `docs/FONT_LICENSE.txt` remains unchanged
- The installed Fiber 9.8.1 package declares MIT but omits its LICENSE file.
  Its copyright and license were verified against the
  [exact upstream v9.8.1 LICENSE](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v9.8.1/LICENSE)

## Review method and boundaries

- Checked actual installed package versions and license files against
  `package-lock.json` (SHA-256 `7770fc28b365de56c3ea2529b2c274898e76a86a1b7a17027de3f78d0d1cce01`)
- Ran an in-memory production Vite/Rollup build (`write: false` and
  `copyPublicDir: false`) with the app's React plugin and manual chunks;
  inspected 70 emitted dependency modules across 17 runtime packages
- Inspected module headers and available installed source-map `sourcesContent`
  for embedded notices. Added the imported font, Router DOM re-export package,
  vendored Meshopt decoder and generated runtime helpers to the inventory
- Did not install packages, change dependency versions, edit application code,
  or modify existing media credits
- Installed dependency families absent from the emitted browser graph (for
  example MediaPipe, Rapier, HLS and Draco) are not claimed as shipped runtime
  components by this inventory. Build/test tools retain their package licenses
  in their own distributions
- Recheck the module inventory and notices after dependency upgrades, changed
  imports, added decoders or build configuration changes. This is a release
  notice record, not a legal opinion or a claim about unseen future bundles

## Production model-path check

At review time, the production catalog and `modeldata/manifest.json` selected
only `/models/ciasny-r35.glb?v=0a36c3ad` (manifest path without query).
The manifest digest was
`0a36c3ada6113edddc1504dcc31347daabe9e54decdf954fb70b3ffb0ae04859`.
`interior` remains `false`; there is no referenced rejected cabin or original
shell asset. The unused TypeScript `original-study` union member is not an
asset path. Other five catalog variants remain explicitly unavailable.
