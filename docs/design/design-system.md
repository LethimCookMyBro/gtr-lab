# GT-R LAB visual direction

Concept generation used the built-in image generation tool only. No paid external provider, API key, CLI fallback, installation, or product code was used. These are visual design references for native HTML/CSS and a real WebGL configurator. Do not display a concept screenshot as working UI.

## Files and native dimensions

- `homepage-desktop.png` — 1435 × 1096; cinematic homepage and lower heritage/engineering narrative
- `configurator-desktop.png` — 1586 × 992; studio canvas, five-action right rail, paint rail
- `models-desktop.png` — 1038 × 1516; six full-width cinematic lineup bands
- `configurator-mobile.png` — 853 × 1844; intended 390 × 844 logical layout
- `assets/hero-silver-r35.png` — clean matching hero photograph with no interface text; final asset may be copied to public assets
- `*-prompt.txt` — full generation prompts; hero asset used the homepage concept as a visual edit reference

## Art direction

Dark architectural automotive editorial. Restrained silver bodywork and almost-black space. The car carries the emotional weight; interface chrome stays light and open. Flat bands, fine separators, small clear controls, disciplined typography. No dashboard, cyberpunk, glowing grids, generic cards, bento layouts, extra metrics, decorative badges, giant corner radii, or colored wash on photography.

The site is an original independent fan project. Never present it as official Nissan, NISMO, or Porsche. Physical badges on the generated vehicle are acceptable object details; GT-R LAB is the separate site identity.

## Color lock

Approximate working tokens extracted from the concepts:

- Page black: #070809
- Studio base: #111316
- Graphite surface: #151719
- Elevated charcoal: #23272A
- Gunmetal: #363A3F
- Primary text: #F3F3F1
- Secondary text: #B4B7BB
- Quiet text: #7F858B
- Silver: #C5C8CB
- Fine line: rgba(218, 221, 224, 0.24)
- Racing-red accent: #C32229, brighter #E1282B only for the tiny brand mark or active point

Photographic surfaces are neutral charcoal, not tinted purple/blue. Paint blue/red swatches are object materials and not UI theme colors. Use natural matching image edges, not a full-image gradient tint.

## Typography

Use a modern neutral grotesk such as Inter, Helvetica Neue, Arial, sans-serif. Avoid sci-fi extended fonts and excessive all-caps.

- Brand: 20–22px desktop, 14–16px mobile; weight 650, tracking 0.14em; small 10–12px red square
- Hero: clamp(52px, 6.4vw, 92px), weight 550–600, line-height 0.98, tracking -0.045em
- Editorial H2: 52–62px desktop, 34–40px mobile; line-height 1.0–1.04; tracking -0.04em
- Model lineup heading: 64–80px desktop, 42px mobile
- Model band title: 36–42px desktop, 28px mobile
- Configurator model heading: 40–48px desktop, 27–30px mobile; tracking -0.025em
- Body: 16–18px desktop, 14–16px mobile; line-height 1.5
- Nav/button: 13–14px; weight 500–550; tracking 0.02em
- Toolbar: 11–12px
- Small categorical label: 10–11px with 0.12em tracking

## Geometry and interaction language

- Desktop outer gutter: 48–64px
- Mobile gutter: 20–22px
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128
- Controls: 42–48px minimum interactive height; mobile hit targets at least 44px even if icon is smaller
- Buttons: 1px hairline; square or at most 2px radius; 18–22px horizontal padding
- No global card family
- Swatches: circles; 28–40px on desktop, about 38px mobile; selected thin outer ring plus small red point
- Icon family: simple 20–24px outline, 1.4–1.6px stroke, no filled multicolor glyphs
- Arrow: horizontal thin stroke and open arrowhead
- Hover: modest opacity or white-line increase; selected state uses one red tick/rule, not large red fills
- Motion: 180–240ms control transitions; page transitions 450–650ms ease-out; respect reduced motion
- Tool actions must expose readable labels, keyboard focus and accessible pressed/expanded states

## Homepage structure and locked copy

Header is an open overlay on the photograph. Left wordmark; right Models, Heritage, Enter configurator. Hero occupies roughly the first 650–780 desktop pixels. Headline left, large silver car across the center/right. There is a quiet scroll cue at the lower left.

Visible copy:
- GT-R LAB
- Models
- Heritage
- Enter configurator
- Engineered to defy.
- An independent exploration of the GT-R.
- Explore the models
- A lineage without compromise.
- Built on a restless pursuit of performance.
- From the road to the circuit, every evolution has a purpose.
- Discover the heritage
- Explore the engineering
- Independent fan project. Not affiliated with Nissan.

The concept's lower narrative is an open dark band: copy at left and a large rear-lamp/detail photograph filling the right. It is not enclosed in a card. The footer is a fine rule and quiet disclosure. Heritage/engineering links must route to real content or sections rather than dead controls.

For mobile, recompose the hero with headline above the vehicle instead of squeezing desktop text beside it. Keep the vehicle prominent and whole. Stack editorial copy and detail imagery while preserving 20px gutters and natural full-bleed media. Collapse nav deliberately; do not overflow navigation.

## Models structure

Open heading area followed by six full-width photographic rows. Each row has model title and short description on the left, car across the center/right, and an Explore action at the far edge. Active or hovered row may have a thin left red edge. Photographic scale and angle vary while panel geometry remains consistent. Recompose to taller bands on mobile, not tiny thumbnail cards.

Locked title: Choose your expression.
Supporting sentence: One unmistakable lineage. Six distinct perspectives.
Order and copy:
1. Premium — The modern icon.
2. NISMO — Performance, intensified.
3. T-spec — A singular point of view.
4. GT-R50 — A sculpted interpretation.
5. GT3 — Built for the circuit.
6. GT500 — The edge of competition.

The concept suggests the distinctive visual character of the variants but is not technical evidence of vehicle geometry or specs. Use verified public sources and licensed/generated assets for the final vehicle data and do not imply six verified 3D models if only one exists.

## Desktop configurator structure

- The real 3D scene is the main surface, occupying the full canvas behind unobtrusive overlays
- Top left: Back to models, separator, GT-R LAB
- Top right: Model detail, current variant
- Small title area below left nav: GT-R Premium; A modern icon, made personal.
- Right vertical five-action toolbar: Camera, Environment, Lights, Rotate, Sound
- Toolbar on open canvas, not boxed sidebar; optional one left separator and red active segment
- Model fills roughly 75% of viewport width with front-facing camera offset and visible contact shadow
- Quiet Drag to explore text above bottom rail
- Bottom rail: small EXTERIOR label and selected paint name left, six swatches centered, optional finish action right

Paint display labels in concept: Super Silver, Gun Metallic, Pearl White, Jet Black, Bayside Blue, Vibrant Red. Treat these as interface text and do not claim all are official options for every variant without validation.

The Finish button is a concept completion affordance only. If the requested app has no finish/export/share stage, omit it rather than creating an inert control. Apply the user's exact requested model controls, configuration dimensions, and detail content even if beyond this visual reference.

## Mobile configurator

Use the supplied mobile image as a recomposition reference at 390 × 844 logical px:
- Header: Models back action, centered GT-R LAB, Detail link
- Title and one-line subline below header
- Scene centered vertically with full vehicle width, no clipped front/rear
- Five-action toolbar becomes a horizontal bottom dock with equal touch zones; Environment may shorten to Scene visually while retaining full accessible label
- Paint tray below dock, selected name and horizontal six-swatch row
- Safe-area spacing below actions
- Do not keep the desktop right rail or shrink labels below legibility

## Truthful implementation boundaries

- Homepage/lineup photographic assets can be generated still images
- Configurator must use actual geometry, lighting, orbit controls and paint changes
- Do not use these still images to impersonate 3D interaction
- Do not use generated visual proportions as technical source data
- If realistic model quality cannot be achieved from available authorized assets, disclose the shortfall rather than call a rough procedural mesh production-realistic

## Visual QA checklist

Compare the relevant generated concept and actual browser screenshot together using view_image. Inspect: car dominance/crop, headline scale and baseline, header spacing, black/graphite color lock, open container model, fine line treatment, toolbar/rail dimensions, touch targets, copy, footer disclosure, and absence of invented filler. Check desktop and 390px mobile. Concepts have been visually inspected; browser implementation verification belongs to the implementation owner.


## Superseded homepage imagery
The initial generated silver R35 illustration was a design exploration. It is not used by the cinematic homepage and has been removed from public assets. The current homepage uses credited original CGI films and authentic photography.
