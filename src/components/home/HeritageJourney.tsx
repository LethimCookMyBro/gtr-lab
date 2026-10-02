import { useRef } from "react";
import { Link } from "react-router-dom";
import { eras } from "./storyMedia";
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
  const chapter = eras[activeEra] || eras[0];
  const navigateEra = (index: number) => {
    const target = section.current?.querySelector<HTMLElement>(
      `[data-era-image="${index}"]`,
    );
    if (!target) return;
    onEra(index);
    const bounds = target.getBoundingClientRect();
    window.scrollTo({
      top: Math.max(
        0,
        scrollY + bounds.top + bounds.height / 2 - innerHeight / 2,
      ),
      behavior: sequentialMotion ? "instant" : "smooth",
    });
  };
  return (
    <section
      ref={section}
      id="home-heritage"
      className="home-archive-runway"
      data-motion-section="heritage"
      data-active-era={activeEra}
      aria-label="GT-R heritage"
    >
      <div className="home-archive-stage">
        <div
          className="home-archive-narrative"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="home-archive-kicker">
            {String(activeEra + 1).padStart(2, "0")} / 04 · {chapter.year}
          </p>
          <h2 key={chapter.year}>{chapter.title}</h2>
          <p className="home-archive-description">{chapter.note}</p>
        </div>
        <nav className="home-archive-navigation" aria-label="GT-R eras">
          {eras.map((era, index) => (
            <button
              key={era.year}
              type="button"
              aria-label={`${era.year}: ${era.name}`}
              aria-current={activeEra === index ? "step" : undefined}
              onClick={() => navigateEra(index)}
            >
              <span aria-hidden="true" />
              {era.year}
            </button>
          ))}
        </nav>
        <Link className="home-archive-source" to="/credits#story-photography">
          Archive photography & sources
        </Link>
      </div>
      <div className="home-archive-track">
        {eras.map((era, index) => (
          <article
            key={era.year}
            className="home-archive-chapter"
            data-era-image={index}
            aria-label={`${era.year} ${era.name}`}
          >
            <div className="home-archive-inline-copy">
              <p>
                {era.year} · {era.name}
              </p>
              <h3>{era.title}</h3>
              <p>{era.note}</p>
            </div>
            <figure className="home-archive-image">
              <img
                src={era.image.src}
                srcSet={`${era.image.small} ${era.image.smallWidth || 800}w, ${era.image.src} ${era.image.width}w`}
                sizes="(max-width: 700px) 92vw, 40vw"
                width={era.image.width}
                height={era.image.height}
                alt={era.image.alt}
                loading="lazy"
              />
              <figcaption>
                <span>{era.generation}</span>
                {era.caption}
              </figcaption>
            </figure>
          </article>
        ))}
      </div>
    </section>
  );
}
