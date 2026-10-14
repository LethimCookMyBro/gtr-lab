import { useCallback, useEffect, useRef, useState } from "react";
import { HeroFilm } from "../components/home/HeroFilm";
import { EditorialOverlap } from "../components/home/EditorialOverlap";
import { ExpandingFilm } from "../components/home/ExpandingFilm";
import { HeritageJourney } from "../components/home/HeritageJourney";
import { RearSignature } from "../components/home/RearSignature";
import { ModelInvitations } from "../components/home/ModelInvitations";
import {
  useHomeMotion,
  useHomePreferences,
} from "../components/home/useHomeMotion";
import "../styles/home.css";
import "../styles/home-rear.css";
import "../styles/home-loading.css";
import { OpeningMark } from "../components/home/OpeningMark";
export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  const [activeEra, setActiveEra] = useState(0);
  const preferences = useHomePreferences();
  const [heroReady, setHeroReady] = useState(false);
  const [visualFailed, setVisualFailed] = useState(false);
  const [released, setReleased] = useState(false);
  const reportHeroReady = useCallback(() => setHeroReady(true), []);
  useEffect(() => {
    if (heroReady || released) return;
    const timeout = window.setTimeout(() => setVisualFailed(true), 25000);
    return () => window.clearTimeout(timeout);
  }, [heroReady, released]);
  // The opening owns only the photograph. Rear GPU preparation and recovery
  // remain local so a slow or unsupported renderer never blocks navigation.
  const pending = !released && !heroReady;
  useEffect(() => {
    if (heroReady) setReleased(true);
  }, [heroReady]);
  const sequential = preferences.reducedMotion || preferences.compactHeight;
  useHomeMotion(root, sequential, setActiveEra);
  return (
    <>
      <OpeningMark
        pending={pending}
        visualFailed={visualFailed}
        heroReady={heroReady}
        reducedMotion={preferences.reducedMotion}
        onRetry={() => window.location.reload()}
        onContinue={() => setReleased(true)}
      />
      <div
        ref={root}
        inert={pending}
        data-home-ready={!pending}
        className="cinematic-home"
        data-reduced-motion={preferences.reducedMotion}
        data-sequential-motion={sequential}
      >
        <HeroFilm
          {...preferences}
          openingResolved={!pending}
          onVisualReady={reportHeroReady}
        />
        <EditorialOverlap />
        <ExpandingFilm {...preferences} />
        <HeritageJourney
          activeEra={activeEra}
          onEra={setActiveEra}
          sequentialMotion={sequential}
        />
        <RearSignature
          reducedMotion={sequential}
          audioReducedMotion={preferences.reducedMotion}
          saveData={preferences.saveData}
        />
        <ModelInvitations />
      </div>
    </>
  );
}
