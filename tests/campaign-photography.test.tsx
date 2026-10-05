// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import credits from "../src/data/home-media-credits.json";
import { ModelInvitations } from "../src/components/home/ModelInvitations";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
afterEach(cleanup);
it("uses the verified campaign photos with honest example descriptions", () => {
  const { container } = render(
    <MemoryRouter>
      <ModelInvitations />
      <HeritageJourney
        activeEra={0}
        onEra={() => {}}
        sequentialMotion={false}
      />
    </MemoryRouter>,
  );
  expect(
    container
      .querySelector(".home-model-invitation--premium img")
      ?.getAttribute("src"),
  ).toContain("campaign-r35-orange");
  expect(
    container
      .querySelector('[data-era-image="2"] .home-timeline-image img')
      ?.getAttribute("alt"),
  ).toMatch(/modified.*R34/i);
  expect(
    container
      .querySelector('[data-era-image="3"] .home-timeline-image img')
      ?.getAttribute("alt"),
  ).toMatch(/modern.*R35/i);
});
it("records free licenses, original source hashes and verifiable local derivatives", () => {
  const assets = credits.assets.filter((asset) =>
    asset.id.startsWith("campaign-"),
  );
  expect(assets).toHaveLength(3);
  for (const asset of assets) {
    expect(asset.license).toBe("Unsplash License");
    expect(asset.sourceUrl).toMatch(/^https:\/\/unsplash.com\/photos\//);
    for (const derivative of asset.derivatives) {
      const bytes = readFileSync(`public${derivative.path}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        derivative.sha256,
      );
    }
  }
});
