import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { eras, storyMedia } from "./storyMedia";
import type { StoryImage } from "./storyMedia";
import { timelineScrollTarget } from "./motion";
function HeritagePlane({
  image,
  className,
  caption,
  era,
}: {
  image: StoryImage;
  className: string;
  caption: string;
  era?: number;
}) {
  return (
    <figure className={`home-heritage-plane ${className}`} data-era-image={era}>
      <img
        src={image.src}
        srcSet={
          image.small
            ? `${image.small} ${image.smallWidth || 800}w, ${image.src} ${image.width}w`
            : undefined
        }
        sizes="(max-width: 700px) 85vw, 45vw"
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading="lazy"
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
export function HeritageJourney({
  activeEra,
  onEra,
  sequentialMotion,
}: {
  activeEra: number;
  onEra: (era: number) => void;
  sequentialMotion: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const navigateEra = (index: number) => {
    onEra(index);
    const element = section.current;
    if (!element) return;
    if (sequentialMotion) {
      const target = element.querySelector<HTMLElement>(
        `[data-era-image="${index}"]`,
      );
      if (target) {
        const rect = target.getBoundingClientRect();
        // Home has no fixed header. Ignore the other routes' global scroll padding.
        window.scrollTo({
          top: Math.max(
            0,
            window.scrollY +
              rect.top -
              Math.max(0, (window.innerHeight - rect.height) / 2),
          ),
          behavior: "instant",
        });
      }
      return;
    }
    const rect = element.getBoundingClientRect();
    window.scrollTo({
      top: timelineScrollTarget(
        rect.top + window.scrollY,
        rect.height,
        window.innerHeight,
        index,
      ),
      behavior: "smooth",
    });
  };
  return (
    <section
      ref={section}
      id="home-heritage"
      className="home-heritage-runway"
      data-motion-section="heritage"
      data-active-era={activeEra}
      aria-labelledby="heritage-title"
    >
      <div className="home-heritage-sticky">
        <div className="home-heritage-visuals">
          <HeritagePlane
            image={storyMedia.origin}
            className="home-heritage-origin"
            caption="1969 · Skyline 2000GT-R"
            era={0}
          />
          <HeritagePlane
            image={storyMedia.r32}
            className="home-heritage-r32"
            caption="1992 · Skyline GT-R R32"
            era={1}
          />
          <HeritagePlane
            image={storyMedia.r34}
            className="home-heritage-r34"
            caption="1999 · Skyline GT-R R34"
          />
          <HeritagePlane
            image={storyMedia.detail}
            className="home-heritage-r35"
            caption="2024 · GT-R NISMO"
            era={2}
          />
        </div>
        <nav className="home-era-navigation" aria-label="GT-R eras">
          {eras.map((era, i) => (
            <button
              key={era.year}
              type="button"
              aria-label={`${era.year}: ${era.name}`}
              aria-current={i === activeEra ? "step" : undefined}
              onClick={() => navigateEra(i)}
            >
              <span className="home-era-node" aria-hidden="true" />
              <span>{era.year}</span>
            </button>
          ))}
        </nav>
        <div className="home-heritage-copy">
          <h2 id="heritage-title">
            An icon
            <br />
            in motion.
          </h2>
          <p>
            The form evolves.
            <br />
            The obsession remains.
          </p>
          <Link to="/heritage" className="home-heritage-link">
            <span>{eras[activeEra].generation}</span>
            <ArrowRight size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>Explore the heritage</span>
          </Link>
          <p className="home-era-description" aria-live="polite">
            {eras[activeEra].note}
          </p>
        </div>
        <Link to="/credits#story-photography" className="home-heritage-credit">
          Archive photography & sources
        </Link>
      </div>
    </section>
  );
}
