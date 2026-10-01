import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { activeEraAt, clamp01, expansionAt, sectionProgress } from "./motion";
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
  const [saveData, setSaveData] = useState(
    () => connection()?.saveData === true,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(query.matches);
    const network = connection();
    const updateData = () => setSaveData(network?.saveData === true);
    query.addEventListener("change", updateMotion);
    network?.addEventListener?.("change", updateData);
    return () => {
      query.removeEventListener("change", updateMotion);
      network?.removeEventListener?.("change", updateData);
    };
  }, []);
  return { reducedMotion, saveData };
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
    if (reduced) {
      const properties = [
        "--progress",
        "--copy-opacity",
        "--film-width",
        "--film-height",
        "--film-radius",
        "--film-surround",
      ];
      sections.forEach((section) =>
        properties.forEach((property) =>
          section.style.removeProperty(property),
        ),
      );
      return;
    }
    let frame = 0;
    let lastEra = -1;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      const measurements = sections.map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }));
      for (const { element, rect } of measurements) {
        const kind = element.dataset.motionSection;
        const progress =
          kind === "editorial"
            ? clamp01((viewport - rect.top) / (rect.height + viewport))
            : sectionProgress(rect.top, rect.height, viewport);
        element.style.setProperty("--progress", progress.toFixed(5));
        if (kind === "hero")
          element.style.setProperty(
            "--copy-opacity",
            String(1 - clamp01((progress - 0.3) / 0.6)),
          );
        if (kind === "expanding") {
          const bounds = expansionAt(progress);
          element.style.setProperty("--film-width", `${bounds.width}%`);
          element.style.setProperty("--film-height", `${bounds.height}svh`);
          element.style.setProperty("--film-radius", `${bounds.radius}px`);
          element.style.setProperty(
            "--film-surround",
            `rgb(${bounds.shade} ${bounds.shade} ${bounds.shade})`,
          );
        }
        if (kind === "heritage") {
          const era = activeEraAt(progress);
          if (era !== lastEra) {
            lastEra = era;
            onEra(era);
          }
        }
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
