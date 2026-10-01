# Railway preview deployment

Status: development preview, not a completed six-vehicle product.

URL: https://gtr-lab-production.up.railway.app/
Repository: https://github.com/LethimCookMyBro/gtr-lab, branch `main`.

## Configuration

- Railway project GT-R LAB, service gtr-lab, production environment in the user's existing workspace
- One replica in Asia Southeast (Singapore); no database, volume, custom domain or paid add-on
- Railpack installs dependencies; build command is `npm run build`, start is `npm start`, healthcheck `/`
- App sleeping is enabled; the next request can have a cold-start delay
- Deployment watch patterns cover app source, public/model assets, package/build configuration and asset-preparation scripts, avoiding documentation/test-only rebuilds
- The runtime streams static files from the built directory and honors Railway's PORT
- Both model and HDRI assets are self-contained in the deployment; no external runtime asset credentials

## Initial verification

Revision `b2579cef674d09d1aeeee5df63462bd5839c2211`, deployment `d6777878-285f-45fd-853b-e31cb41445b0`: build and healthcheck succeeded. Public HEAD requests to `/`, `/models`, `/configurator/premium` and `/models/ciasny-r35.glb` returned200. The GLB response is8,296,356 bytes, matching the initial accepted exterior revision.

The direct cloud browser opened the actual homepage and followed Enter configurator. That browser does not expose WebGL; the deployed app correctly displayed its photo/error fallback instead of a blank screen. A separate public-URL Chromium/SwiftShader workflow verifies rendered3D and essential controls. Run36847271913 subsequently passed actual public-URL WebGL, paint/lamp/detail and studio/forest/coast checks at1440×900 and390×844 after verifying revision1a6f68faf21cc32442a1ef919e05049716194ae0 deployed successfully.

The first Nixpacks build failed because a redundant `npm ci` attempted to remove the mounted dependency cache. The config now selects current Railpack and runs build only after dependency installation.

## Cost boundary

The user approved this preview on the existing Hobby plan after disclosure that its included usage is shared and overage is possible. This project did not change workspace billing or limits. Idle sleep and a single small static-serving process keep the baseline modest. Early measurements were approximately33MB RAM and0.00078CPU; these are not a monthly quote or proof of remaining workspace credits. Traffic, model downloads and other projects can affect the bill.

## Acceptance still open

Five exact variant assets, an accepted detailed cabin, final source-correct visual QA, physical GPU/mobile performance remain separate acceptance items. No rejected original exterior or cabin is deployed.

## Repository presentation

GitHub About Website is set to the exact live Railway URL. Only `main` remains; the temporary WIP branch was removed after verifying its commits were retained on main.
