import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Film } from "./Film";
export function HeroFilm({
  reducedMotion,
  saveData,
}: {
  reducedMotion: boolean;
  saveData: boolean;
}) {
  return (
    <section
      className="home-hero-runway"
      data-motion-section="hero"
      aria-labelledby="home-title"
    >
      <div className="home-hero-sticky">
        <Film kind="hero" reducedMotion={reducedMotion} saveData={saveData} />
        <div className="home-hero-copy">
          <h1 id="home-title">
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
