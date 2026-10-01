export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export function viewportProgress(
  top: number,
  height: number,
  viewport: number,
) {
  return clamp01((viewport - top) / Math.max(1, viewport + height));
}
/** Complementary layers keep one complete archive photograph visible through each handoff. */
export function heritageLayersAt(progress: number) {
  const ease = (start: number, end: number) => {
    const value = clamp01((progress - start) / (end - start));
    return value * value * (3 - 2 * value);
  };
  const first = ease(0.22, 0.44);
  const second = ease(0.56, 0.78);
  return [1 - first, first - second, second];
}
/** Progress of a sticky section, using its real scrollable runway. */
export function sectionProgress(top: number, height: number, viewport: number) {
  return clamp01(-top / Math.max(1, height - viewport));
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
export function activeEraAt(progress: number) {
  return Math.min(2, Math.floor(clamp01(progress) * 3));
}
export function timelineScrollTarget(
  top: number,
  height: number,
  viewport: number,
  era: number,
) {
  return (
    top + (Math.max(0, height - viewport) * Math.min(2, Math.max(0, era))) / 2
  );
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
