# Vercel deployment

GT-R LAB is a Vite single-page application. Deploy the repository root from `main`
with the Vite framework preset, Node 22.x or 24.x, `npm ci`, `npm run build`, and
output directory `dist`. The checked-in `vercel.json` supplies these build settings
apart from the Node version. No API keys, database, server process or Railway
service is required. Do not run `npm start` as a Vercel build command.

The normal build reconstructs and verifies model/cabin/film chunks, then fetches
missing pinned Poly Haven HDR/PBR/roadside assets before TypeScript and Vite build.
Cold builds need access to `dl.polyhaven.org`; failures must not be bypassed by
removing hash checks or silently omitting the model. Browser requests use the
resulting local static files. Publisher-hosted films still depend on Flixel.

The SPA fallback covers extensionless URLs, including
`/configurator/premium?study=2008`. Requests for missing `.glb`, `.js`, `.mp4` and
other files retain real HTTP 404 responses rather than receiving HTML. Existing
static files take precedence. Security headers mirror `server.mjs`; fingerprinted
Vite bundles are immutable, other model/media files have a one-hour browser cache,
and HTML revalidates. Vercel serves ranges/compression itself; this migration does
not claim the old server's gzip-sidecar negotiation is reproduced.

## Release verification

After a deployment reports Ready, verify its source commit, homepage, direct
configurator refresh, query-string study selection, an actual GLB response and
its decoded SHA-256, missing-file 404, security headers, and a video byte-range
response. Then run the applicable browser flows against the new origin.

Historical Railway evidence and closed-origin test contracts stay unchanged;
they do not certify the Vercel origin. Do not simply point those contracts at a
new domain and call the old evidence valid. Update the GitHub About website link
only after the new public URL is verified.

References: [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite),
[static configuration](https://vercel.com/docs/project-configuration/vercel-json).
