import { useRef, useState } from "react";
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
export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  const [activeEra, setActiveEra] = useState(0);
  const preferences = useHomePreferences();
  const sequential = preferences.reducedMotion || preferences.compactHeight;
  useHomeMotion(root, sequential, setActiveEra);
  return (
    <div
      ref={root}
      className="cinematic-home"
      data-reduced-motion={preferences.reducedMotion}
      data-sequential-motion={sequential}
    >
      <HeroFilm {...preferences} />
      <EditorialOverlap />
      <ExpandingFilm {...preferences} />
      <HeritageJourney
        activeEra={activeEra}
        onEra={setActiveEra}
        sequentialMotion={sequential}
      />
      <RearSignature {...preferences} />
      <ModelInvitations />
    </div>
  );
}
