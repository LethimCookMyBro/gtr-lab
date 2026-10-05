import { useRef } from "react";
import { Link } from "react-router-dom";
import { eras } from "./storyMedia";
import type { ArchivePhoto } from "./storyMedia";
import "../../styles/home-heritage.css";

function ArchiveFigure({
  photo,
  primary = false,
  cue,
}: {
  photo: ArchivePhoto;
  primary?: boolean;
  cue: string;
}) {
  const { image } = photo;
  return (
    <figure
      className={primary ? "home-archive-image" : "home-archive-support-image"}
      data-motion-anchor={primary ? cue : photo.credit}
      data-motion-stage={primary ? "media" : "detail"}
      data-motion-enter-with={primary ? undefined : cue}
    >
      <div className="home-archive-photo-mat">
        <img
          src={image.src}
          srcSet={
            image.small
              ? `${image.small} ${image.smallWidth || 640}w, ${image.src} ${image.width}w`
              : undefined
          }
          sizes={
            primary
              ? "(max-width: 700px) 90vw, (max-width: 1050px) 45vw, 31vw"
              : "(max-width: 700px) 90vw, (max-width: 1050px) 45vw, 27vw"
          }
          width={image.width}
          height={image.height}
          alt={image.alt}
          loading="lazy"
          decoding="async"
        />
      </div>
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

function ArchiveChapter({ index }: { index: number }) {
  const era = eras[index];
  const [lead, road, engine] =
    index === 1 ? [era.photos[1], era.photos[0], era.photos[2]] : era.photos;
  return (
    <article
      id={`home-era-${era.year}`}
      className={`home-archive-chapter${index === 1 ? " home-archive-r32" : ""}`}
      tabIndex={-1}
      data-era-image={index}
      aria-label={`${era.year} ${era.name}`}
    >
      <div className="home-archive-exhibition home-r32-stage home-archive-spread">
        <div
          className="home-archive-inline-copy home-archive-heading-row"
          data-motion-anchor={`era-${era.year}-heading`}
          data-motion-stage="heading"
        >
          <div className="home-archive-year-slot" aria-hidden="true">
            <span className="home-archive-year">{era.year}</span>
          </div>
          <p className="home-archive-generation">
            {era.generation} · {era.theme}
          </p>
          <h3>{era.title}</h3>
          <p className="home-archive-description">{era.note}</p>
          <div className="home-archive-achievement">
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
        <div className="home-archive-lead">
          <ArchiveFigure photo={lead} primary cue={`era-${era.year}-lead`} />
        </div>
        <div className="home-archive-support">
          <ArchiveFigure photo={road} cue={`era-${era.year}-lead`} />
          <ArchiveFigure photo={engine} cue={`era-${era.year}-lead`} />
        </div>
      </div>
    </article>
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
    const r32Stage = target.querySelector<HTMLElement>(".home-r32-stage");
    const pinned = r32Stage && getComputedStyle(r32Stage).position === "sticky";
    // Direct era navigation arrives at the complete reading hold. Native scrolling
    // still owns every entrance and exit, including when travelling backwards.
    const destination = pinned
      ? scrollY +
        target.getBoundingClientRect().top -
        Number.parseFloat(getComputedStyle(r32Stage).top) +
        (target.offsetHeight - r32Stage.offsetHeight - 52) * 0.65
      : scrollY +
        target.getBoundingClientRect().top -
        scrollPadding -
        railHeight -
        16;
    onEra(index);
    window.scrollTo({
      top: Math.max(0, destination),
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
      <header
        className="home-archive-intro"
        data-motion-anchor="archive-intro"
        data-motion-stage="heading"
      >
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
          <ArchiveChapter key={era.year} index={index} />
        ))}
      </div>
      <p className="home-archive-colophon">
        Historic machines, documented honestly. Capture dates and image credits
        accompany every photograph.
      </p>
    </section>
  );
}
