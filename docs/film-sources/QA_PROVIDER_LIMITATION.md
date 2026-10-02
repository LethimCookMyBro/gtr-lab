# Hosted-film QA and provider limitations

## Separate application checks from external playback

The homepage and Railway smoke workflows run layout/motion browser regressions and `tests/hosted-film.test.tsx`. The lifecycle tests cover exact iframe sources, Stop/Play, offscreen and hidden-tab unloading, reduced-motion/Save-Data opt-in, and timeout/retry. The existing vehicle smoke check remains in place.

These workflows explicitly exclude the three external-player acceptance cases and report that playback was **not exercised**. A green workflow proves only its stated application checks. The mobile motion diagnostic records mounted iframes, host lifecycle states and frame geometry; neither `embedded` nor an iframe `load` event establishes that video is playing.

## Evidence recorded on 2 October 2026

- GitHub-runner Chromium received provider HTTP 403 responses and SAMEORIGIN framing restrictions. The external acceptance tests could not observe a playing provider video there. This is a provider/environment limitation, not passing playback evidence.
- A real browser on the public Railway origin at [the film embed probe](https://gtr-lab-production.up.railway.app/film-embed-check.html) verified advancing playback for both exact NissanNews/Flixel clips: opening `7x5domma49p8pb7z8k1l` and detail `t53p8d1vu4miy763a938`. Both decoded at 1920 × 1080; Stop, restart and offscreen unloading were verified. This probe evidence is separate from final homepage acceptance for a release commit.
- The app uses the intact publisher players documented in [DRIVING_EMBEDS.md](DRIVING_EMBEDS.md). No headers are stripped, no provider response is proxied and no video is extracted or rehosted to make tests pass.

## Explicit external acceptance

The external tests remain unchanged in `e2e/home-motion.spec.ts` and require `REQUIRE_HOME_FILMS=1`. Run them deliberately in a browser environment where the provider accepts playback, targeting the public deployment:

```sh
HOME_QA_URL=https://gtr-lab-production.up.railway.app \
REQUIRE_HOME_FILMS=1 \
npx playwright test -c playwright.home.config.ts --project=home-desktop \
  --grep "real films advance|keeps both hosted films unloaded"
```

Use `--project=home-mobile` for the mobile acceptance pass. A blocked environment must report blocked/unverified, not convert the test into a success. Do not repeat a known-blocked provider matrix on every push.

For each release, verify the exact deployed revision in a real browser on its public origin. Observe successive video frames for both films, Stop then Play, offscreen unloading, and reduced-motion/Save-Data explicit playback. Check desktop and mobile presentation and record the revision, origin, browser, date and results. The probe above supports the provider decision; it does not replace this final homepage verification.
