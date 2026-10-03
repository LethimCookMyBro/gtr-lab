import { useEffect, useState } from "react";
import type { RefObject } from "react";
import {
  clamp01,
  expansionAt,
  heroExitAt,
  sectionProgress,
  viewportProgress,
} from "./motion";
// Short landscape retains its safe layout; portrait phones keep the story with browser chrome open.
const compactStoryQuery =
  "(max-height: 599px), (min-width: 701px) and (max-height: 740px)";
type DataConnection = EventTarget & { saveData?: boolean };
const connection = () =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: DataConnection }).connection;
const reducedPreference = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export function useHomePreferences() {
  const [reducedMotion, setReducedMotion] = useState(reducedPreference);
  const [compactHeight, setCompactHeight] = useState(
    () =>
      typeof matchMedia === "function" && matchMedia(compactStoryQuery).matches,
  );
  const [saveData, setSaveData] = useState(
    () => connection()?.saveData === true,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(query.matches);
    const heightQuery = window.matchMedia(compactStoryQuery);
    const updateHeight = () => setCompactHeight(heightQuery.matches);
    const network = connection();
    const updateData = () => setSaveData(network?.saveData === true);
    query.addEventListener("change", updateMotion);
    heightQuery.addEventListener("change", updateHeight);
    network?.addEventListener?.("change", updateData);
    return () => {
      query.removeEventListener("change", updateMotion);
      heightQuery.removeEventListener("change", updateHeight);
      network?.removeEventListener?.("change", updateData);
    };
  }, []);
  return { reducedMotion, saveData, compactHeight };
}
/** A single passive listener and batched read/write RAF for the entire story. */
export function useHomeMotion(
  root: RefObject<HTMLDivElement | null>,
  reduced: boolean,
  onEra: (era: number) => void,
) {
  useEffect(() => {
    const sections = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        "[data-motion-section]",
      ) ?? []),
    ];
    const anchors = sections.flatMap((section) =>
      [...section.querySelectorAll<HTMLElement>("[data-motion-anchor]")].map(
        (element) => ({ element, section }),
      ),
    );
    const chapters = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        ".home-archive-chapter",
      ) ?? []),
    ];
    if (reduced) {
      const properties = [
        "--progress",
        "--copy-opacity",
        "--hero-exit-opacity",
        "--hero-exit-lift",
        "--film-width",
        "--film-height",
        "--film-radius",
        "--film-surround",
        "--item-progress",
        "--item-reveal",
        "--era-0-opacity",
        "--era-1-opacity",
        "--era-2-opacity",
        "--year-opacity",
        "--chapter-progress",
        "--chapter-reveal",
      ];
      [
        ...sections,
        ...chapters,
        ...anchors.map((anchor) => anchor.element),
      ].forEach((section) => {
        properties.forEach((property) =>
          section.style.removeProperty(property),
        );
        section.removeAttribute("data-copy-inactive");
        section
          .querySelector(".home-hero-support a")
          ?.removeAttribute("tabindex");
      });
    }
    let frame = 0;
    let lastEra = -1;
    const written = new WeakMap<HTMLElement, Map<string, string>>();
    const write = (element: HTMLElement, property: string, value: string) => {
      const previous = written.get(element) || new Map<string, string>();
      if (previous.get(property) === value) return;
      element.style.setProperty(property, value);
      previous.set(property, value);
      written.set(element, previous);
    };
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      const measurements = sections.map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        stickyHeight:
          element.dataset.motionSection === "editorial"
            ? viewport
            : (element.firstElementChild as HTMLElement | null)?.offsetHeight ||
              viewport,
      }));
      // offsetTop/offsetHeight ignore our visual transforms. Accumulate the layout's offset
      // parents, so section padding and nested positioning never feed back into the motion.
      const anchorMeasurements = anchors.map(({ element, section }) => {
        let top = 0;
        let current: HTMLElement | null = element;
        while (current && current !== section) {
          top += current.offsetTop;
          current = current.offsetParent as HTMLElement | null;
        }
        return {
          element,
          top:
            top +
            measurements.find((item) => item.element === section)!.rect.top,
          height: element.offsetHeight,
        };
      });
      const chapterMeasurements = chapters.map((element, index) => ({
        element,
        index,
        rect: element.getBoundingClientRect(),
      }));
      const archiveRail = root.current?.querySelector<HTMLElement>(
        ".home-archive-stage",
      );
      const readingLine =
        (Number.parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingTop,
        ) || 88) +
        (archiveRail?.offsetHeight || 0) +
        32;
      // All geometry above is read before the first style mutation below.
      if (!reduced)
        for (const { element, rect, stickyHeight } of measurements) {
          const kind = element.dataset.motionSection;
          const progress =
            kind === "editorial"
              ? clamp01((viewport - rect.top) / (rect.height + viewport))
              : sectionProgress(rect.top, rect.height, stickyHeight);
          write(element, "--progress", progress.toFixed(5));
          if (kind === "hero") {
            const exit = heroExitAt(progress);
            write(element, "--hero-exit-opacity", exit.opacity.toFixed(5));
            write(element, "--hero-exit-lift", `${exit.lift.toFixed(3)}px`);
            write(
              element,
              "--copy-opacity",
              String(1 - clamp01((progress - 0.3) / 0.6)),
            );
            element.toggleAttribute("data-copy-inactive", progress >= 0.9);
            const action = element.querySelector<HTMLAnchorElement>(
              ".home-hero-support a",
            );
            if (action) action.tabIndex = progress >= 0.9 ? -1 : 0;
          }
          if (kind === "expanding") {
            const bounds = expansionAt(progress);
            write(element, "--film-width", `${bounds.width}%`);
            write(element, "--film-height", `${bounds.height}svh`);
            write(element, "--film-radius", `${bounds.radius}px`);
            write(
              element,
              "--film-surround",
              `rgb(${bounds.shade} ${bounds.shade} ${bounds.shade})`,
            );
          }
        }
      let nextEra = 0;
      let nearest = Infinity;
      for (const { element, index, rect } of chapterMeasurements) {
        const distance =
          rect.top > readingLine
            ? rect.top - readingLine
            : rect.bottom < readingLine
              ? readingLine - rect.bottom
              : 0;
        if (distance < nearest) {
          nearest = distance;
          nextEra = index;
        }
        if (!reduced) {
          write(
            element,
            "--chapter-progress",
            viewportProgress(rect.top, rect.height, viewport).toFixed(5),
          );
          write(
            element,
            "--chapter-reveal",
            clamp01((viewport * 0.95 - rect.top) / (viewport * 0.3)).toFixed(5),
          );
        }
      }
      if (chapters.length && nextEra !== lastEra) {
        lastEra = nextEra;
        onEra(nextEra);
      }

      if (!reduced)
        for (const { element, top, height } of anchorMeasurements) {
          const progress = viewportProgress(top, height, viewport);
          write(element, "--item-progress", progress.toFixed(5));
          write(
            element,
            "--item-reveal",
            clamp01((progress - 0.08) / 0.44).toFixed(5),
          );
        }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(schedule);
    sections.forEach((section) => observer?.observe(section));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [root, reduced, onEra]);
}
