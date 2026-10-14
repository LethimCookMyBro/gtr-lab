import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  R35SectionAudioController,
  sectionViewportFraction,
} from "./r35SectionAudioController";
import type {
  SectionSoundPreferences,
  SectionSoundSnapshot,
} from "./r35SectionAudioController";

export function useR35SectionAudio(
  sectionRef: RefObject<HTMLElement | null>,
  navigationKey: string,
  preferences: SectionSoundPreferences,
) {
  const controller = useRef<R35SectionAudioController | null>(null);
  const latestPreferences = useRef(preferences);
  latestPreferences.current = preferences;
  const [snapshot, setSnapshot] = useState<SectionSoundSnapshot>({
    phase: "idle",
    muted: false,
    error: null,
    enabled: false,
  });
  useEffect(() => {
    const next = new R35SectionAudioController(latestPreferences.current);
    controller.current = next;
    setSnapshot(next.getSnapshot());
    const unsubscribe = next.subscribe(() => setSnapshot(next.getSnapshot()));
    let frame = 0;
    const measure = () => {
      frame = 0;
      const section = sectionRef.current;
      if (!section) return;
      next.setViewportFraction(
        sectionViewportFraction(
          section.getBoundingClientRect(),
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // Geometry is measured at most once per frame. A section-height IO ratio
    // would make entry impossible for long runways and short landscape screens.
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      unsubscribe();
      next.dispose();
      if (controller.current === next) controller.current = null;
    };
  }, [navigationKey, sectionRef]);
  useEffect(() => {
    controller.current?.setPreferences(preferences);
  }, [preferences.reducedMotion, preferences.saveData]);
  return {
    ...snapshot,
    toggleFromGesture: (event: Event) =>
      controller.current?.toggleFromGesture(event),
  };
}
