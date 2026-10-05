// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
import * as motion from "../src/components/home/motion";
afterEach(cleanup);
const show = () =>
  render(
    <MemoryRouter>
      <HeritageJourney
        activeEra={0}
        onEra={() => {}}
        sequentialMotion={false}
      />
    </MemoryRouter>,
  );
it("leads with exactly four alternating single-photograph panels and factual years", () => {
  const { container } = show();
  const panels = [...container.querySelectorAll(".home-timeline-panel")];
  expect(panels).toHaveLength(4);
  expect(panels.map((panel) => panel.getAttribute("data-side"))).toEqual([
    "left",
    "right",
    "left",
    "right",
  ]);
  expect(
    [...container.querySelectorAll(".home-archive-year")].map(
      (year) => year.textContent,
    ),
  ).toEqual(["1969", "1989", "1999", "2007"]);
  for (const panel of panels) {
    expect(panel.querySelectorAll(":scope > figure img")).toHaveLength(1);
    expect(panel.querySelectorAll(".home-timeline-caption > p")).toHaveLength(
      1,
    );
    expect(panel.querySelector("details[open]")).toBeNull();
  }
});
it("keeps original evidence and credits in an accessible disclosure for every era", () => {
  const { container } = show();
  const details = [...container.querySelectorAll("details")];
  expect(details).toHaveLength(4);
  for (const detail of details) {
    expect(detail.querySelector("summary")?.textContent).toBe(
      "Story & photo credits",
    );
    expect(detail.querySelectorAll("figure img")).toHaveLength(3);
    expect(detail.querySelectorAll('a[href^="/credits#"]')).toHaveLength(4);
  }
  expect(screen.getByRole("navigation", { name: "GT-R eras" })).toBeTruthy();
});
it("sharpens the reading center and softly recedes in both scroll directions", () => {
  expect(motion).toHaveProperty("timelineMotionAt");
  const score = (
    motion as unknown as {
      timelineMotionAt: (distance: number) => {
        opacity: number;
        blur: number;
        scale: number;
      };
    }
  ).timelineMotionAt;
  expect(score(0)).toEqual({ opacity: 1, blur: 0, scale: 1 });
  expect(score(1).opacity).toBeGreaterThan(0.3);
  expect(score(1).opacity).toBeLessThan(0.6);
  expect(score(1).blur).toBeGreaterThan(0);
  expect(score(-0.75)).toEqual(score(0.75));
  expect(score(0.75).scale).toBeLessThan(1);
});
