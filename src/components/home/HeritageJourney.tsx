import { useRef } from "react";
import { Link } from "react-router-dom";
import { eras } from "./storyMedia";
import "../../styles/home-heritage.css";
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
    if (sequentialMotion) {
      const scrollPadding =
        Number.parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingTop,
        ) || 88;
      window.scrollTo({
        top: Math.max(
          0,
          scrollY + target.getBoundingClientRect().top - scrollPadding,
        ),
        behavior: "instant",
      });
      target.focus({ preventScroll: true });
      return;
    }
    const bounds = (
      target.querySelector<HTMLElement>(".home-archive-image") || target
    ).getBoundingClientRect();
    const sectionBounds = section.current!.getBoundingClientRect();
    const sectionTop = scrollY + sectionBounds.top;
    const stageHeight =
      section.current!.querySelector<HTMLElement>(".home-archive-stage")
        ?.offsetHeight || innerHeight;
    const desired =
      scrollY +
      bounds.top +
      bounds.height / 2 -
      innerHeight * (innerWidth <= 700 ? 0.59 : 0.5);
    const destination = Math.max(
      sectionTop,
      Math.min(sectionTop + sectionBounds.height - stageHeight, desired),
    );
    window.scrollTo({
      top: destination,
      behavior: "smooth",
    });
  };
  return (
    <section
      ref={section}
      id="home-heritage"
      className="home-archive-runway home-heritage-editorial"
      data-heritage-sequential={sequentialMotion}
      data-motion-section="heritage"
      data-active-era={activeEra}
      aria-label="GT-R heritage"
    >
      <div className="home-archive-stage">
        <p className="home-archive-eyebrow">Selected milestones · 1969—2007</p>
        <div
          className="home-archive-narrative"
          aria-live={sequentialMotion ? "off" : "polite"}
          aria-atomic="true"
        >
          <p className="home-archive-kicker">
            {String(activeEra + 1).padStart(2, "0")} / 04 · {chapter.year}
          </p>
          <p className="home-archive-year" aria-hidden="true">
            {chapter.year}
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
              aria-controls={`home-era-${era.year}`}
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
            id={`home-era-${era.year}`}
            className="home-archive-chapter"
            tabIndex={-1}
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
                sizes="(max-width: 700px) 92vw, (prefers-reduced-motion: reduce) 48vw, (max-height: 740px) 48vw, 32vw"
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
