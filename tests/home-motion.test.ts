import { describe, expect, it } from "vitest";
import {
  expansionAt,
  sectionProgress,
  mayAutoplay,
  viewportProgress,
} from "../src/components/home/motion";

describe("native homepage scroll geometry", () => {
  it("stages each editorial image from its own viewport crossing", () => {
    expect(viewportProgress(700, 400, 700)).toBe(0);
    expect(viewportProgress(150, 400, 700)).toBe(0.5);
    expect(viewportProgress(-400, 400, 700)).toBe(1);
    expect(viewportProgress(-500, 400, 700)).toBe(1);
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
