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
      if (m.asset.status === "ready")
        expect(new URL(m.asset.url!, "https://gtr-lab.test").pathname).toMatch(
          /\.glb$/,
        );
      else expect(m.asset.url).toBeNull();
      expect(m.sourceUrls.length).toBeGreaterThan(0);
    }
  });
  it("uses the licensed R35 on one route without relabeling it as six variants", () => {
    const available = models.filter((m) => m.asset.status === "ready");
    expect(available.map((m) => m.id)).toEqual(["premium"]);
    expect(available[0].asset.author).toBe("Ciasny");
    expect(available[0].asset.materialRoles.paint).toEqual(["CarPaint"]);
    expect(available[0].asset.displayName).toBe("GT-R R35");
    expect(available[0].asset.referenceNote).toContain("2024 Premium");
    expect(available[0].asset.interior).toBe(false);
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
  it("keeps the GT-R50 prototype and its estimates in one coherent year", () => {
    const model = getModel("gtr50")!;
    expect(model.modelYear).toBe("2018 prototype specification");
    expect(model.outputIsEstimate).toBe(true);
    expect(model.notes.join(" ")).not.toMatch(/Euro 6|2021 production/);
    expect(model.sourceUrls[0]).toBe(
      "https://global.nissannews.com/en/releases/nissan-and-italdesign-to-unveil-ultra-limited-gt-r-prototype",
    );
  });
  it("keeps the selected GT3 target separate from later EVO revisions", () => {
    expect(getModel("gt3")?.modelYear).toBe("2018-spec FIA GT3");
    expect(getModel("gt3")?.notes.join(" ")).toContain("2015-spec Bathurst");
  });
  it("rejects unknown variant without silently renaming a mesh", () =>
    expect(getModel("fake")).toBeUndefined());
  it("provides nine conceptual paints and eight cameras", () => {
    expect(paints.length).toBeGreaterThanOrEqual(9);
    expect(cameraPresets).toHaveLength(8);
  });
});
