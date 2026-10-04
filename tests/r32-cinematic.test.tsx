// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HeritageJourney } from "../src/components/home/HeritageJourney";
import * as motion from "../src/components/home/motion";
afterEach(cleanup);

describe("R32 competition composition", () => {
  it("leads with real racing evidence without implying the Australian photograph is a Japanese race", () => {
    const { container } = render(
      <MemoryRouter>
        <HeritageJourney
          activeEra={1}
          onEra={() => {}}
          sequentialMotion={false}
        />
      </MemoryRouter>,
    );
    const r32 = container.querySelector<HTMLElement>('[data-era-image="1"]')!;
    const lead = r32.querySelector<HTMLElement>(".home-archive-image")!;
    expect(within(lead).getByRole("img").getAttribute("alt")).toContain(
      "Oran Park in Australia",
    );
    expect(lead.textContent).toContain("21 June 1992");
    expect(r32.textContent).toContain(
      "Japanese Touring Car Championship · 1990–1993",
    );
    expect(
      within(r32)
        .getByRole("link", { name: "R32 milestone source" })
        .getAttribute("href"),
    ).toBe(
      "https://www.nissan-global.com/EN/HERITAGE_COLLECTION/249_skyline_gt-r.html",
    );
    expect(r32.querySelectorAll("figure")).toHaveLength(3);
    expect(container.querySelectorAll("#home-heritage figure")).toHaveLength(
      12,
    );
    expect(within(r32).getByRole("heading").textContent).toMatch(
      /29 races.*No defeats/s,
    );
  });
});

describe("R32 authored scroll score", () => {
  it("opens the racing photograph before revealing supporting road and engine evidence", () => {
    const early = motion.r32MotionAt(0);
    const race = motion.r32MotionAt(0.3);
    const held = motion.r32MotionAt(0.7);
    expect(early.photoClip).toBeGreaterThan(20);
    expect(race.photoClip).toBe(0);
    expect(race.roadReveal).toBeLessThan(1);
    expect(race.engineReveal).toBeLessThan(race.roadReveal);
    expect(held).toMatchObject({
      photoClip: 0,
      titleShift: 0,
      roadReveal: 1,
      engineReveal: 1,
      exitShift: 0,
    });
  });
  it("has a reversible exit and clamps overscroll without losing the whole-frame photo", () => {
    const held = motion.r32MotionAt(0.7);
    expect(motion.r32MotionAt(1).exitShift).toBeLessThan(-30);
    expect(motion.r32MotionAt(0.7)).toEqual(held);
    expect(motion.r32MotionAt(-1)).toEqual(motion.r32MotionAt(0));
    expect(motion.r32MotionAt(2)).toEqual(motion.r32MotionAt(1));
  });
});
