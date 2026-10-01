import { describe, it, expect } from "vitest";
import { models, getModel } from "../src/data/models";
import { paints, cameraPresets } from "../src/data/configuration";
describe("accurate distinct lineup", () => {
  it("has six distinct variant identities and images", () => {
    expect(models).toHaveLength(6);
    expect(new Set(models.map((m) => m.id)).size).toBe(6);
    expect(new Set(models.map((m) => m.image)).size).toBe(6);
  });
  it("does not invent GLB readiness", () => {
    for (const m of models) {
      if (m.asset.status === "ready") expect(m.asset.url).toMatch(/\.glb$/);
      else expect(m.asset.url).toBeNull();
      expect(m.sourceUrls.length).toBeGreaterThan(0);
    }
  });
  it("keeps GT500 distinct from road-car specifications", () => {
    expect(getModel("gt500")?.engine).toContain("inline-four");
    expect(getModel("gt500")?.drive).toBe("Rear-wheel drive");
  });
  it("never assigns the race-car RWD fallback to the bespoke GT-R50", () => {
    expect(getModel("gtr50")?.drive).toContain("AWD");
    expect(getModel("gtr50")?.notes.join(" ")).toContain("2018 prototype");
  });
  it("keeps metric horsepower units intact", () => {
    expect(getModel("gtr50")?.powerUnit).toBe("PS");
    expect(getModel("premium")?.powerUnit).toBe("hp");
  });
  it("rejects unknown variant without silently renaming a mesh", () =>
    expect(getModel("fake")).toBeUndefined());
  it("provides nine conceptual paints and eight cameras", () => {
    expect(paints.length).toBeGreaterThanOrEqual(9);
    expect(cameraPresets).toHaveLength(8);
  });
});
