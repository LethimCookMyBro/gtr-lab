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
import type { HomeSceneLoadState } from "../components/home/homeReadiness";
export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  const [activeEra, setActiveEra] = useState(0);
  const preferences = useHomePreferences();
  const [heroReady, setHeroReady] = useState(false);
  const [visualFailed, setVisualFailed] = useState(false);
  const [scene, setScene] = useState<HomeSceneLoadState>({ phase: "module" });
  const [attempt, setAttempt] = useState(0);
  const [skip3D, setSkip3D] = useState(false);
  const [released, setReleased] = useState(false);
  const reportHeroReady = useCallback(() => setHeroReady(true), []);
  useEffect(() => {
    if (heroReady || released || skip3D) return;
    const timeout = window.setTimeout(() => setVisualFailed(true), 25000);
    return () => window.clearTimeout(timeout);
  }, [heroReady, released, skip3D]);
  const gateState: HomeSceneLoadState =
    visualFailed && !heroReady && scene.phase !== "error"
      ? {
          phase: "error",
          message:
            "The opening visual took too long to load. Reload the page or continue without 3D.",
          recovery: "reload",
        }
      : preferences.saveData
        ? { phase: "deferred" }
        : scene;
  const prepared =
    heroReady && (scene.phase === "ready" || preferences.saveData);
  const pending = !released && !skip3D && !prepared;
  useEffect(() => {
    if (prepared) setReleased(true);
  }, [prepared]);
  const retry = () => {
    if (gateState.phase === "error" && gateState.recovery === "reload") {
      window.location.reload();
      return;
    }
    setScene({ phase: "module" });
    setAttempt((value) => value + 1);
  };
  const sequential = preferences.reducedMotion || preferences.compactHeight;
  useHomeMotion(root, sequential, setActiveEra);
  return (
    <>
      <OpeningMark
        pending={pending}
        scene={gateState}
        heroReady={heroReady}
        reducedMotion={preferences.reducedMotion}
        onRetry={retry}
        onContinue={() => {
          setSkip3D(true);
          setReleased(true);
        }}
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
          saveData={preferences.saveData}
          attempt={attempt}
          disabled={skip3D}
          onLoadState={setScene}
        />
        <ModelInvitations />
      </div>
    </>
  );
}
