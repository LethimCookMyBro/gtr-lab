import { describe, expect, it } from "vitest";
import { createTargetTransitionClock } from "../src/components/three/targetTransition";

describe("target-relative exponential time", () => {
  it("composes 60 Hz samples to the same exponential as one elapsed sample", () => {
    let now = 0;
    const clock = createTargetTransitionClock(() => now);
    clock.reset();
    let value = 0;
    for (let frame = 1; frame <= 60; frame++) {
      now = (frame * 1000) / 60;
      const alpha = clock.sampleAlpha(false);
      expect(alpha).toBeCloseTo(1 - Math.exp(-7 / 60), 13);
      value += (1 - value) * alpha;
    }
    expect(value).toBeCloseTo(1 - Math.exp(-7), 14);
  });

  it("accounts for each long gap once and does not advance at repeated timestamps", () => {
    let now = 100_000;
    const clock = createTargetTransitionClock(() => now);
    clock.reset();
    now += 3500;
    expect(clock.sampleAlpha(false)).toBe(1 - Math.exp(-7 * 3.5));
    expect(clock.sampleAlpha(false)).toBe(0);
    now += 1000 / 60;
    expect(clock.sampleAlpha(false)).toBeCloseTo(1 - Math.exp(-7 / 60), 12);
  });

  it("resets rapid targets, isolates owners and always honors reduced motion", () => {
    let now = 0;
    const first = createTargetTransitionClock(() => now);
    const second = createTargetTransitionClock(() => now);
    now = 3500;
    first.reset();
    now += 20;
    first.reset();
    expect(first.sampleAlpha(false)).toBe(0);
    expect(second.sampleAlpha(false)).toBe(1 - Math.exp(-7 * 3.52));
    expect(first.sampleAlpha(true)).toBe(1);
  });

  it("never counts a regressing timestamp twice", () => {
    let now = 100;
    const clock = createTargetTransitionClock(() => now);
    now = 200;
    expect(clock.sampleAlpha(false)).toBe(1 - Math.exp(-7 * 0.1));
    now = 150;
    expect(clock.sampleAlpha(false)).toBe(0);
    now = 220;
    expect(clock.sampleAlpha(false)).toBe(1 - Math.exp(-7 * 0.02));
  });
});
