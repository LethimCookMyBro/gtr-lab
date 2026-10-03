# Brand identity assets

The project uses the supplied stacked chrome GT / red R raster badge and an unmodified historical chrome Nissan SVG. Neither mark is reconstructed with a font, recolored, stretched or given a new fabricated outline. The public `/credits#brand-marks` section and `/brand/ATTRIBUTION.txt` explain provenance and the rights limits.

## Sources and rights

- GT-R: supplied 640 × 640 PNG, copied byte-for-byte. Copyright permission is unverified. Do not call it a licensed or vector asset, imply commercial-use clearance, or treat user supply as a license grant.
- Nissan: [Commons source record](https://commons.wikimedia.org/wiki/File:Nissan_logo_2001.svg), [original SVG](https://upload.wikimedia.org/wikipedia/commons/4/4f/Nissan_logo_2001.svg). The record credits Nissan, attributes its upstream source to Logos Wiki, and describes the historical 2001–2020 mark. Commons' PD-textlogo / TOO-Japan classification comes with an explicit trademark warning; it does not mean Nissan approved this project. The downloaded SVG has no scripts or external-resource dependencies.
- Font: [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), Barlow Condensed Bold by Jeremy Tribby / The Barlow Project Authors. The original TTF and full SIL OFL 1.1 are self-hosted together; no package dependency or runtime third-party font request is added. DM Sans remains the body/UI font. Barlow is an independent motorsport-inspired heading choice, not an official Nissan typeface.

## Presentation contract

`GtrWordmark` exposes one accessible image labeled “Nissan GT-R”; its constituent images are decorative to avoid duplicate announcements. Both images have intrinsic dimensions and preserve their aspect ratio. The Nissan emblem is subordinate above the GT-R badge.

- `--gtr-badge-width`: total source width, default `clamp(238px, 22vw, 280px)`
- `--gtr-nissan-width`: emblem width, default `64px`
- The GT-R viewport is 640:450. Translating the square source image upward by 170 source pixels removes only excess black canvas. Bright emblem bounds were measured at x=23–618 / y=182–595; the viewport includes y=170–620.
- No flashing, logo re-drawing, looping shimmer, color filters or stretched letterforms
- A `sweep` prop remains for caller compatibility and carries state only. Loading/progress motion belongs to the gate, not the trademark artwork.
- The black source canvas remains black. Place the badge against a black or near-black surface; do not claim transparent source pixels.

## Verification

`tests/brand-identity.test.tsx` checks the two-image rendering, original asset hashes, retained DM Sans body text, self-hosted heading font/license and public provenance disclosure. Visual QA must additionally check emblem edges at desktop/mobile widths, rear-scene spacing, heading wrapping, cards and credit links after the full homepage integration.
