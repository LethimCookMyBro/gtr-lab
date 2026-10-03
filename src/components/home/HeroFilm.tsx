import { ArrowRight } from "lucide-react";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Film } from "./Film";
import type { FilmState } from "./Film";
import "../../styles/home-opening-cards.css";
import "../../styles/home-hero-exit.css";
export function HeroFilm({
  reducedMotion,
  saveData,
  openingResolved = true,
  onVisualReady,
}: {
  reducedMotion: boolean;
  saveData: boolean;
  openingResolved?: boolean;
  onVisualReady?: () => void;
}) {
  const reportFilm = useCallback(
    (state: FilmState) => {
      if (state === "embedded") onVisualReady?.();
    },
    [onVisualReady],
  );
  return (
    <>
      <section
        className="home-hero-runway"
        data-motion-section="hero"
        data-hero-exit-enabled={!reducedMotion && !saveData}
        data-opening-resolved={openingResolved}
        aria-labelledby="home-title"
      >
        <div className="home-hero-sticky">
          <Film
            kind="hero"
            reducedMotion={reducedMotion}
            saveData={saveData}
            onStateChange={reportFilm}
            onFallbackReady={onVisualReady}
          />
          <div className="home-hero-copy">
            <h1 id="home-title" tabIndex={-1}>
              Engineered
              <br />
              to defy.
            </h1>
            <div className="home-hero-support">
              <p>
                An independent exploration
                <br className="home-desktop-break" /> of an icon in motion.
              </p>
              <Link to="/models" className="home-outline-link">
                Explore the models{" "}
                <ArrowRight size={24} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="home-hero-handoff" aria-hidden="true" />
    </>
  );
}
