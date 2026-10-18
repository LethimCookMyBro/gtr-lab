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
  const [posterReady, setPosterReady] = useState(false);
  const [playerDocumentReady, setPlayerDocumentReady] = useState(false);
  const expectsPlayer = !preferences.reducedMotion && !preferences.saveData;
  // Cross-origin document readiness is observable; video playback is not.
  const heroReady = posterReady && (!expectsPlayer || playerDocumentReady);
  const [visualFailed, setVisualFailed] = useState(false);
  const [released, setReleased] = useState(false);
  const reportHeroReady = useCallback(() => setPosterReady(true), []);
  useEffect(() => {
    if (heroReady || released) return;
    const timeout = window.setTimeout(() => setVisualFailed(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [heroReady, released]);
  // Prepare the poster and publisher document together. Rear GPU work stays
  // local; visitors can skip immediately or recover after the bounded deadline.
  const pending = !released && !heroReady;
  useEffect(() => {
    if (heroReady) setReleased(true);
  }, [heroReady]);
  const sequential = preferences.reducedMotion || preferences.compactHeight;
  useHomeMotion(root, sequential, setActiveEra);
  return (
    <>
      {expectsPlayer && (
        <>
          <link rel="preconnect" href="https://media.flixel.com" />
          <link rel="preconnect" href="https://cdn.flixel.com" />
        </>
      )}
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
          onDocumentReady={setPlayerDocumentReady}
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
