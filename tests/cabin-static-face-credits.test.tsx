// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CreditsPage } from "../src/pages/CreditsPage";
import { getModel } from "../src/data/models";
afterEach(cleanup);
it("discloses static instrument artwork and preserves its font credit independently of the exterior", () => {
  render(<CreditsPage />);
  expect(
    screen.getByRole("heading", { name: "Original cabin study" }),
  ).toBeTruthy();
  const license = screen.getByRole("link", {
    name: "Static face typography · font license",
  });
  expect(license.getAttribute("href")).toBe(
    "/licenses/cabin-static-faces-DejaVu.txt",
  );
  const text = readFileSync(
    "public/licenses/cabin-static-faces-DejaVu.txt",
    "utf8",
  );
  expect(text).toContain("Copyright (c) 2003 by Bitstream");
  expect(text).toContain("Permission is hereby granted");
  expect(getModel("premium")!.asset.limitations!.join(" ")).toMatch(
    /static illustrations, not working instruments or live telemetry/,
  );
  expect(getModel("premium")!.asset.author).toBe("Ciasny");
});
