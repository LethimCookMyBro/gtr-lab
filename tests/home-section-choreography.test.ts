import { describe, expect, it } from "vitest";
import { storyItemAt } from "../src/components/home/motion";

describe("shared reversible section choreography", () => {
  it("reveals the heading before the main photograph, then supporting evidence", () => {
    const heading = storyItemAt(720, 300, 1000, "heading");
    const image = storyItemAt(720, 300, 1000, "media");
    const detail = storyItemAt(720, 300, 1000, "detail");
    expect(heading.reveal).toBeGreaterThan(image.reveal);
    expect(image.reveal).toBeGreaterThan(detail.reveal);
    expect(heading.reveal).toBeGreaterThan(0.9);
    expect(detail.reveal).toBeLessThan(0.25);
  });

  it("holds content fully legible through the reading area and fades only at the exit", () => {
    for (const stage of ["heading", "media", "detail"] as const) {
      expect(storyItemAt(300, 500, 1000, stage)).toEqual({
        reveal: 1,
        opacity: 1,
        shift: 0,
      });
      const leaving = storyItemAt(-450, 500, 1000, stage);
      expect(leaving.reveal).toBe(1);
      expect(leaving.opacity).toBeGreaterThan(0.5);
      expect(leaving.opacity).toBeLessThan(1);
      expect(leaving.shift).toBe(0);
    }
  });

  it("derives forward and reverse frames from geometry without history or overshoot", () => {
    const positions = [1100, 850, 720, 400, 0, -450, -650];
    const forward = positions.map((top) =>
      storyItemAt(top, 500, 1000, "media"),
    );
    const reverse = [...positions]
      .reverse()
      .map((top) => storyItemAt(top, 500, 1000, "media"));
    expect(reverse.reverse()).toEqual(forward);
    for (const frame of forward) {
      expect(frame.reveal).toBeGreaterThanOrEqual(0);
      expect(frame.reveal).toBeLessThanOrEqual(1);
      expect(frame.opacity).toBeGreaterThanOrEqual(0);
      expect(frame.opacity).toBeLessThanOrEqual(1);
      expect(frame.shift).toBeGreaterThanOrEqual(0);
      expect(frame.shift).toBeLessThanOrEqual(24);
    }
    expect(forward.at(-1)?.opacity).toBe(0);
  });

  it("can use a sibling image as the entrance cue without changing its own exit geometry", () => {
    const heading = storyItemAt(800, 200, 1000, "heading", 720);
    expect(heading.reveal).toBeGreaterThan(0.9);
    const evidence = storyItemAt(400, 200, 1000, "detail", 720);
    expect(evidence.reveal).toBeLessThan(0.25);
    expect(storyItemAt(-400, 200, 1000, "detail", -100).opacity).toBe(0);
  });
});
