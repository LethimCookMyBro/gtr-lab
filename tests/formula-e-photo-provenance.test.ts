import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import imageCredits from "../src/data/image-credits.json";

const photo = imageCredits.find((credit) => credit.id === "formula-e")!;

it("keeps published image metadata identical to the catalog credits, including retained GT500 provenance", () => {
  const published = JSON.parse(
    readFileSync("public/images/credits.json", "utf8"),
  );
  expect(published).toEqual(imageCredits);
  expect(
    published.find((credit: { id: string }) => credit.id === "gt500"),
  ).toEqual(imageCredits.find((credit) => credit.id === "gt500"));
});

it("records the exact CC0 JPEG, author and season distinction in companion documentation", () => {
  const credits = readFileSync("docs/IMAGE_CREDITS.md", "utf8");
  const section = credits.split("## formula-e\n")[1]?.split("\n## ")[0];
  expect(section).toBeDefined();
  for (const value of [
    photo.path,
    photo.author,
    photo.authorUrl!,
    photo.licenseUrl,
    photo.sourceUrl,
    photo.downloadUrl!,
    photo.sha256,
    "246,734",
    "1280 × 702",
    "2024/25 Season 11",
    "2025/26 Season 12",
    "2026-10-14",
  ])
    expect(section).toContain(value);
  expect(credits).toContain("## gt500\n");
  expect(credits).toContain(
    imageCredits.find((credit) => credit.id === "gt500")!.sha256,
  );
});

it("lists Formula E photography as acquired while licensed 3D geometry remains missing", () => {
  const status = readFileSync("docs/ASSETS_REQUIRED.md", "utf8");
  expect(status).toContain("2024/25 Season 11");
  expect(status).toContain("2025/26 Season 12");
  expect(status).toContain("CC0");
  expect(status).toContain("Formula E 3D geometry remains unavailable");
  expect(status).toContain("2024/25 GEN3 Evo reference");
  expect(status).not.toContain(
    "Formula E has no rights-cleared reference image integrated",
  );
  expect(status).not.toContain("Formula E uses a neutral");
  expect(status).not.toContain(
    "Missing rights-cleared image and licensed 3D geometry",
  );
  expect(status).toContain("Retained historical GT500 image");
});
