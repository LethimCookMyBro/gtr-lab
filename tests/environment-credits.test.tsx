// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CreditsPage } from "../src/pages/CreditsPage";
afterEach(cleanup);
it("names the active environment's original geometry and five licensed asset sources", () => {
  render(<CreditsPage />);
  expect(screen.getByRole("heading", { name: "3D environments" })).toBeTruthy();
  for (const id of [
    "garage_floor",
    "concrete_wall_008",
    "asphalt_pit_lane",
    "aerial_rocks_02",
    "kloofendal_43d_clear_puresky",
  ]) {
    expect(
      document.querySelector(`a[href="https://polyhaven.com/a/${id}"]`),
    ).not.toBeNull();
  }
  expect(screen.getByText(/Original modelled spaces/)).toBeTruthy();
});
