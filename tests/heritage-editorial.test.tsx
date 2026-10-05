// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CreditsPage } from "../src/pages/CreditsPage";
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
  document.documentElement.style.scrollPaddingTop = "100px";
  const button = screen.getByRole("button", { name: "2007: R35 GT-R" });
  button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(scroll).toHaveBeenCalledWith({ top: 876, behavior: "instant" });
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
      ).toBe(button.getAttribute("aria-label")?.replace(":", ""));
    }
  }
});

it("presents three individually captioned photographs and a sourced achievement in each era", () => {
  const { container } = render(
    <MemoryRouter>
      <HeritageJourney
        activeEra={0}
        onEra={() => {}}
        sequentialMotion={false}
      />
    </MemoryRouter>,
  );
  const chapters = [
    ...container.querySelectorAll<HTMLElement>(".home-archive-chapter"),
  ];
  expect(chapters).toHaveLength(4);
  for (const chapter of chapters) {
    expect(chapter.querySelectorAll("details img")).toHaveLength(3);
    expect(chapter.querySelectorAll(".home-timeline-image img")).toHaveLength(
      1,
    );
    expect(chapter.querySelectorAll("figure figcaption")).toHaveLength(3);
    expect(
      chapter.querySelector(".home-timeline-details-body strong")?.textContent,
    ).toBeTruthy();
    expect(
      within(chapter)
        .getByRole("link", { name: /historical source/i, hidden: true })
        .getAttribute("href"),
    ).toMatch(/^https:\/\//);
    for (const figure of chapter.querySelectorAll("details figure")) {
      expect(figure.querySelector("figcaption")?.textContent).toBeTruthy();
      expect(figure.querySelector("a")?.getAttribute("href")).toMatch(
        /^\/credits#/,
      );
    }
  }
  expect(screen.getByText(/replica, photographed in 2012/i)).toBeTruthy();
  expect(screen.getByText(/KPGC10 shown/i)).toBeTruthy();
  expect(screen.getByText(/Oran Park, 21 June 1992/i)).toBeTruthy();
  expect(screen.getByText(/1999-spec.*photographed in 2011/i)).toBeTruthy();
  expect(screen.getByText(/Bathurst, February 2015/i)).toBeTruthy();
});

it("normal-motion era navigation reveals the chapter heading with clear space below the page header", async () => {
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const onEra = vi.fn();
  const { container } = render(
    <MemoryRouter>
      <HeritageJourney activeEra={0} onEra={onEra} sequentialMotion={false} />
    </MemoryRouter>,
  );
  const chapter = container.querySelector<HTMLElement>('[data-era-image="2"]')!;
  vi.spyOn(chapter, "getBoundingClientRect").mockReturnValue({
    top: 1500,
    bottom: 2400,
    height: 900,
    x: 0,
    y: 1500,
    width: 1200,
    left: 0,
    right: 1200,
    toJSON() {},
  });
  document.documentElement.style.scrollPaddingTop = "100px";
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "1999: R34 GT-R" }));
  expect(scroll).toHaveBeenCalledWith({ top: 1376, behavior: "smooth" });
  expect(onEra).toHaveBeenCalledWith(2);
  expect(document.activeElement).toBe(chapter);
});

it("every exhibited photo has a matching direct credit destination", () => {
  const { container } = render(
    <MemoryRouter>
      <HeritageJourney activeEra={0} onEra={() => {}} sequentialMotion />
      <CreditsPage />
    </MemoryRouter>,
  );
  for (const link of container.querySelectorAll<HTMLAnchorElement>(
    "#home-heritage figure a",
  )) {
    expect(
      container.querySelector(`[id="${link.hash.slice(1)}"]`),
      link.hash,
    ).not.toBeNull();
  }
});
