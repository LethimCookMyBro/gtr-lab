// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
import * as motion from "../src/components/home/motion";
afterEach(cleanup);
it("gives every archive chapter a centered factual year slot and three framed original photographs", () => {
  const { container } = render(
    <MemoryRouter>
      <HeritageJourney
        activeEra={0}
        onEra={() => {}}
        sequentialMotion={false}
      />
    </MemoryRouter>,
  );
  const chapters = [...container.querySelectorAll(".home-archive-chapter")];
  expect(
    chapters.map(
      (c) => c.querySelector(".home-archive-year-slot")?.textContent,
    ),
  ).toEqual(["1969", "1989", "1999", "2007"]);
  for (const chapter of chapters) {
    expect(chapter.querySelector(".home-archive-exhibition")).toBeTruthy();
    expect(chapter.querySelectorAll(".home-archive-photo-mat")).toHaveLength(3);
    expect(chapter.querySelectorAll("figure img")).toHaveLength(3);
    expect(chapter.querySelectorAll("figure figcaption a")).toHaveLength(3);
  }
});
it("moves the factual year through a masked slot then holds all photos for reading and reverses exactly", () => {
  expect(motion).toHaveProperty("exhibitionMotionAt");
  const score = (
    motion as unknown as {
      exhibitionMotionAt: (p: number) => {
        yearShift: number;
        leadReveal: number;
        roadReveal: number;
        engineReveal: number;
        exitShift: number;
      };
    }
  ).exhibitionMotionAt;
  expect(score(0).yearShift).toBe(110);
  expect(score(0.65)).toEqual({
    yearShift: 0,
    leadReveal: 1,
    roadReveal: 1,
    engineReveal: 1,
    exitShift: 0,
  });
  expect(score(1).yearShift).toBe(-110);
  expect(score(0.2).leadReveal).toBeGreaterThan(score(0.2).roadReveal);
  expect(score(0.35).roadReveal).toBeGreaterThan(score(0.35).engineReveal);
  const path = [0, 0.2, 0.4, 0.65, 0.8, 1];
  expect(path.map(score)).toEqual([...path].reverse().map(score).reverse());
});
