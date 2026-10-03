export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export function viewportProgress(
  top: number,
  height: number,
  viewport: number,
) {
  return clamp01((viewport - top) / Math.max(1, viewport + height));
}
/** Progress of a sticky section, using its real scrollable runway. */
export function sectionProgress(top: number, height: number, viewport: number) {
  return clamp01(-top / Math.max(1, height - viewport));
}
/** Late, reversible easing for the complete hero panel, never the provider iframe. */
export function heroExitAt(progress: number) {
  const phase = clamp01((progress - 0.52) / 0.48);
  const eased = phase * phase * (3 - 2 * phase);
  return {
    opacity: 1 - eased * 0.24,
    lift: eased === 0 ? 0 : -28 * eased,
  };
}
export function expansionAt(progress: number) {
  const p = clamp01(progress);
  return {
    width: 80 + 20 * p,
    height: 58 + 42 * p,
    radius: 22 * (1 - p),
    shade: Math.round(255 - 248 * p),
  };
}
export type StoryStage = "heading" | "media" | "detail";
const storyStages = {
  heading: { start: 0.97, end: 0.67, rise: 16 },
  media: { start: 0.9, end: 0.55, rise: 24 },
  detail: { start: 0.83, end: 0.43, rise: 18 },
} as const;
const smoothstep = (value: number) => {
  const phase = clamp01(value);
  return phase * phase * (3 - 2 * phase);
};
/** One calm entrance, readable hold and edge-only exit, driven by layout rather
 * than elapsed time. A sibling may cue the entrance; the item's own bounds
 * always determine its exit, including when the document is read backwards. */
export function storyItemAt(
  top: number,
  height: number,
  viewport: number,
  stage: StoryStage = "media",
  entranceTop = top,
) {
  const timing = storyStages[stage];
  const view = Math.max(1, viewport);
  const reveal = smoothstep(
    (view * timing.start - entranceTop) / (view * (timing.start - timing.end)),
  );
  const exit = smoothstep((view * 0.14 - (top + height)) / (view * 0.22));
  return {
    reveal,
    opacity: (0.16 + reveal * 0.84) * (1 - exit),
    shift: (1 - reveal) * timing.rise,
  };
}
export function mayAutoplay(preferences: {
  reducedMotion: boolean;
  saveData: boolean;
  visible: boolean;
  documentVisible: boolean;
}) {
  return (
    !preferences.reducedMotion &&
    !preferences.saveData &&
    preferences.visible &&
    preferences.documentVisible
  );
}
