import { describe, expect, it } from "vitest";
import {
  activeEraAt,
  expansionAt,
  sectionProgress,
  timelineScrollTarget,
  mayAutoplay,
  heritageLayersAt,
  heritageYearOpacityAt,
  viewportProgress,
} from "../src/components/home/motion";

describe("native homepage scroll geometry", () => {
  it("fades the single decorative year through zero at each era switch", () => {
    expect(heritageYearOpacityAt(0)).toBe(1);
    expect(heritageYearOpacityAt(1 / 3)).toBe(0);
    expect(heritageYearOpacityAt(0.5)).toBe(1);
    expect(heritageYearOpacityAt(2 / 3)).toBe(0);
    expect(heritageYearOpacityAt(1)).toBe(1);
    expect(heritageYearOpacityAt(0.32)).toBeLessThan(0.1);
    expect(heritageYearOpacityAt(0.34)).toBeLessThan(0.1);
  });
  it("stages each editorial image from its own viewport crossing", () => {
    expect(viewportProgress(700, 400, 700)).toBe(0);
    expect(viewportProgress(150, 400, 700)).toBe(0.5);
    expect(viewportProgress(-400, 400, 700)).toBe(1);
    expect(viewportProgress(-500, 400, 700)).toBe(1);
  });
  it("crossfades heritage photographs continuously without a blank interval", () => {
    expect(heritageLayersAt(0)).toEqual([1, 0, 0]);
    expect(heritageLayersAt(0.5)).toEqual([0, 1, 0]);
    expect(heritageLayersAt(1)).toEqual([0, 0, 1]);
    for (let step = 0; step <= 100; step++) {
      const layers = heritageLayersAt(step / 100);
      expect(layers.reduce((total, layer) => total + layer, 0)).toBeCloseTo(1);
      expect(Math.max(...layers)).toBeGreaterThanOrEqual(0.5);
    }
    expect(heritageLayersAt(0.32)[0]).toBeGreaterThan(
      heritageLayersAt(0.34)[0],
    );
    expect(heritageLayersAt(0.32)[1]).toBeLessThan(heritageLayersAt(0.34)[1]);
  });
  it("clamps pinned progress to the measured scroll runway", () => {
    expect(sectionProgress(200, 2700, 900)).toBe(0);
    expect(sectionProgress(-900, 2700, 900)).toBe(0.5);
    expect(sectionProgress(-4000, 2700, 900)).toBe(1);
    expect(sectionProgress(-100, 900, 900)).toBe(1);
  });
  it("expands actual bounds continuously from inset to fullscreen", () => {
    expect(expansionAt(0)).toEqual({
      width: 80,
      height: 58,
      radius: 22,
      shade: 255,
    });
    expect(expansionAt(0.5)).toEqual({
      width: 90,
      height: 79,
      radius: 11,
      shade: 131,
    });
    expect(expansionAt(1)).toEqual({
      width: 100,
      height: 100,
      radius: 0,
      shade: 7,
    });
  });
  it("selects eras and calculates real document scroll destinations", () => {
    expect([0, 0.34, 0.67, 1].map(activeEraAt)).toEqual([0, 1, 2, 2]);
    expect(timelineScrollTarget(3200, 2700, 900, 1)).toBe(4100);
    expect(timelineScrollTarget(3200, 2700, 900, 2)).toBe(5000);
  });
  it("requires visible, motion-allowed and data-allowed playback", () => {
    expect(
      mayAutoplay({
        reducedMotion: false,
        saveData: false,
        visible: true,
        documentVisible: true,
      }),
    ).toBe(true);
    for (const key of ["reducedMotion", "saveData"] as const) {
      expect(
        mayAutoplay({
          reducedMotion: false,
          saveData: false,
          visible: true,
          documentVisible: true,
          [key]: true,
        }),
      ).toBe(false);
    }
    expect(
      mayAutoplay({
        reducedMotion: false,
        saveData: false,
        visible: false,
        documentVisible: true,
      }),
    ).toBe(false);
    expect(
      mayAutoplay({
        reducedMotion: false,
        saveData: false,
        visible: true,
        documentVisible: false,
      }),
    ).toBe(false);
  });
});
