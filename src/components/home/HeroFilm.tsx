import { ArrowRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Film } from "./Film";
import type { FilmState } from "./Film";
import { OpeningMark } from "./OpeningMark";
import "../../styles/home-opening-cards.css";
export function HeroFilm({
  reducedMotion,
  saveData,
}: {
  reducedMotion: boolean;
  saveData: boolean;
}) {
  const [openingResolved, setOpeningResolved] = useState(
    reducedMotion || saveData,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const resolveOpening = useCallback((state: FilmState) => {
    if (state !== "loading") setOpeningResolved(true);
  }, []);
  const continueToPage = useCallback(() => {
    setOpeningResolved(true);
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="home-hero-runway"
      data-motion-section="hero"
      aria-labelledby="home-title"
      onFocusCapture={(event) => {
        // Never leave keyboard focus visually covered by the nonmodal opening.
        if (!(event.target as HTMLElement).closest(".home-opening")) {
          setOpeningResolved(true);
        }
      }}
    >
      <div className="home-hero-sticky">
        <OpeningMark
          pending={!openingResolved && !reducedMotion && !saveData}
          onContinue={continueToPage}
        />
        <Film
          kind="hero"
          reducedMotion={reducedMotion}
          saveData={saveData}
          onStateChange={resolveOpening}
        />
        <div className="home-hero-copy">
          <h1 id="home-title" ref={heading} tabIndex={-1}>
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
  );
}
