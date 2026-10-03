import { useRef } from "react";
import { Link } from "react-router-dom";
import { eras } from "./storyMedia";
import type { ArchivePhoto } from "./storyMedia";
import "../../styles/home-heritage.css";

function ArchiveFigure({
  photo,
  primary = false,
}: {
  photo: ArchivePhoto;
  primary?: boolean;
}) {
  const { image } = photo;
  return (
    <figure
      className={primary ? "home-archive-image" : "home-archive-support-image"}
    >
      <img
        src={image.src}
        srcSet={
          image.small
            ? `${image.small} ${image.smallWidth || 640}w, ${image.src} ${image.width}w`
            : undefined
        }
        sizes={
          primary
            ? "(max-width: 700px) 92vw, (max-width: 1050px) 61vw, 58vw"
            : "(max-width: 700px) 92vw, 30vw"
        }
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <span className="home-archive-photo-label">{photo.label}</span>
        <span>{photo.caption}</span>
        <Link
          to={`/credits#${photo.credit}`}
          aria-label={`Photo credit: ${photo.caption}`}
        >
          ↗
        </Link>
      </figcaption>
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
    const target = section.current?.querySelector<HTMLElement>(
      `[data-era-image="${index}"]`,
    );
    if (!target) return;
    const scrollPadding =
      Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      ) || 88;
    const railHeight =
      section.current?.querySelector<HTMLElement>(".home-archive-stage")
        ?.offsetHeight || 0;
    onEra(index);
    window.scrollTo({
      top: Math.max(
        0,
        scrollY +
          target.getBoundingClientRect().top -
          scrollPadding -
          railHeight -
          16,
      ),
      behavior: sequentialMotion ? "instant" : "smooth",
    });
    target.focus({ preventScroll: true });
  };
  return (
    <section
      ref={section}
      id="home-heritage"
      className="home-archive-runway home-heritage-editorial"
      data-heritage-sequential={sequentialMotion}
      data-motion-section="heritage"
      data-active-era={activeEra}
      aria-labelledby="home-archive-title"
    >
      <header className="home-archive-intro">
        <p className="home-archive-eyebrow">The competition archive</p>
        <h2 id="home-archive-title">The road remembers.</h2>
        <p>Four chapters. One restless idea: there is always more to find.</p>
      </header>
      <div className="home-archive-stage">
        <span className="home-archive-rail-label" aria-hidden="true">
          GT-R / HERITAGE
        </span>
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
              <span className="home-archive-rail-year">{era.year}</span>
              <span className="home-archive-rail-generation">
                {era.generation}
              </span>
            </button>
          ))}
        </nav>
        <Link className="home-archive-source" to="/credits#story-photography">
          Archive photography & sources <span aria-hidden="true">↗</span>
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
            <div className="home-archive-heading-row">
              <div className="home-archive-inline-copy">
                <p className="home-archive-kicker">
                  {String(index + 1).padStart(2, "0")} / {era.year}{" "}
                  <span>
                    {era.generation} · {era.theme}
                  </span>
                </p>
                <h3>{era.title}</h3>
              </div>
              <div className="home-archive-achievement">
                <span className="home-archive-fact-label">
                  Competition record
                </span>
                <strong>{era.achievement}</strong>
                <span>{era.achievementNote}</span>
                <a
                  href={era.source}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${era.generation} milestone source`}
                >
                  Milestone source ↗
                </a>
              </div>
            </div>
            <div className="home-archive-spread">
              <div className="home-archive-lead">
                <ArchiveFigure photo={era.photos[0]} primary />
                <p className="home-archive-description">{era.note}</p>
              </div>
              <div className="home-archive-support">
                <ArchiveFigure photo={era.photos[1]} />
                <ArchiveFigure photo={era.photos[2]} />
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="home-archive-colophon">
        Historic machines, documented honestly. Capture dates and image credits
        accompany every photograph.
      </p>
    </section>
  );
}
