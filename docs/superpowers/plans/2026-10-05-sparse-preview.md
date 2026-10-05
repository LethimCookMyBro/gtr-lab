# Sparse preview implementation plan

> For agentic workers: use test-driven implementation and a final independent review.

Goal: implement the already approved sparse timeline, quiet model cards, satin rear and honest film entry for preview.

Architecture: reuse the existing React page and single native-scroll motion loop. Keep rear and film changes isolated; integrate shared styles centrally. Preserve media licenses, audio controls and production release gate.

Tech stack: React, TypeScript, Three.js, Vitest, Playwright.

Spec: docs/design/sparse-timeline-preview.md

## Constraints and review focus

- Main only, no force push, no production deployment or gate mutation
- References must be inspected as pixels; free assets only
- Keyboard disclosures, reverse scrolling, reduced motion, Save-Data and failed provider loads retain useful content
- One desktop/mobile capture batch, one fix batch, one confirmation

## Tasks

- [x] Write failing timeline tests for four single-photo panels, small factual years, preserved details/credits and reversible focus scores
- [x] Implement HeritageJourney.tsx, home-heritage.css and timelineMotionAt in the existing scroll loop; run focused tests
- [x] Write failing quiet-card tests, remove cursor motion and repeated labels, integrate campaign image provenance; run focused tests
- [x] In parallel, test and refine rear materials without changing the model or lifecycle
- [x] In parallel, test and repair film entry/readiness; integrate viewport CSS
- [ ] Update browser acceptance tests to the approved composition, capture short native-scroll evidence, and run full required CI on exact commit
- [ ] Review desktop/mobile pixels together, apply one material-fix batch, confirm and report remaining limits
