// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HeritageJourney } from "../src/components/home/HeritageJourney";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.scrollPaddingTop = "";
});

it("sequential timeline preserves the whole selected story and moves keyboard focus to it", async () => {
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = render(
    <MemoryRouter>
      <HeritageJourney activeEra={0} onEra={() => {}} sequentialMotion />
    </MemoryRouter>,
  );
  const chapter = container.querySelector<HTMLElement>('[data-era-image="3"]')!;
  vi.spyOn(chapter, "getBoundingClientRect").mockReturnValue({
    top: 1000,
    bottom: 1750,
    height: 750,
    x: 0,
    y: 1000,
    width: 600,
    left: 0,
    right: 600,
    toJSON() {},
  });
  vi.spyOn(
    chapter.querySelector<HTMLElement>(".home-archive-image")!,
    "getBoundingClientRect",
  ).mockReturnValue({
    top: 1300,
    bottom: 1750,
    height: 450,
    x: 0,
    y: 1300,
    width: 600,
    left: 0,
    right: 600,
    toJSON() {},
  });
  document.documentElement.style.scrollPaddingTop = "100px";
  const button = screen.getByRole("button", { name: "2007: R35 GT-R" });
  button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(scroll).toHaveBeenCalledWith({ top: 900, behavior: "instant" });
  expect(document.activeElement).toBe(chapter);
});

it("timeline controls identify the story they reveal in both motion modes", () => {
  const { container, rerender } = render(
    <MemoryRouter>
      <HeritageJourney
        activeEra={0}
        onEra={() => {}}
        sequentialMotion={false}
      />
    </MemoryRouter>,
  );
  for (const sequentialMotion of [false, true]) {
    rerender(
      <MemoryRouter>
        <HeritageJourney
          activeEra={0}
          onEra={() => {}}
          sequentialMotion={sequentialMotion}
        />
      </MemoryRouter>,
    );
    for (const button of screen.getAllByRole("button")) {
      const id = button.getAttribute("aria-controls");
      expect(id).toBeTruthy();
      expect(
        container.querySelector(`[id="${id}"]`)?.getAttribute("aria-label"),
      ).toContain(button.textContent);
    }
  }
});
