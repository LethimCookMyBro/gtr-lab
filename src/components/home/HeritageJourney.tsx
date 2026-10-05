import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { eras } from "./storyMedia";
import { campaignMedia } from "./campaignMedia";
import type { ArchivePhoto } from "./storyMedia";
import "../../styles/home-heritage.css";

const introductions = [
  {
    title: "A racing heart.",
    sentence:
      "The first GT-R arrived in 1969 as a four-door Skyline with an S20 straight-six and a win on its racing debut.",
  },
  {
    title: "The legend returns.",
    sentence:
      "Twin-turbo power and ATTESA E-TS four-wheel drive made the R32 a new force, with 29 wins from 29 JTCC starts.",
  },
  {
    title: "A sharper instinct.",
    sentence:
      "The R34 carried the Skyline GT-R into 1999, refining a formula that had already become an icon.",
  },
  {
    title: "Beyond Skyline.",
    sentence:
      "Introduced in 2007, the R35 gave GT-R its own name and a 3.8-litre twin-turbo V6.",
  },
];

function ArchiveFigure({ photo }: { photo: ArchivePhoto }) {
  return (
    <figure className="home-archive-evidence">
      <img
        src={photo.image.src}
        width={photo.image.width}
        height={photo.image.height}
        alt={photo.image.alt}
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <span>{photo.caption}</span>
        <Link
          to={`/credits#${photo.credit}`}
          aria-label={`Photo credit: ${photo.caption}`}
        >
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </figcaption>
    </figure>
  );
}

function ArchiveChapter({ index }: { index: number }) {
  const era = eras[index];
  const photo =
    index === 2
      ? campaignMedia.r34
      : index === 3
        ? campaignMedia.r35
        : era.photos.find((item) => item.label === "The road car") ||
          era.photos[0];
  const copy = introductions[index];
  return (
    <article
      id={`home-era-${era.year}`}
      className="home-archive-chapter"
      tabIndex={-1}
      data-era-image={index}
      aria-label={`${era.year} ${index === 0 ? "PGC10 " : ""}${era.name}`}
    >
      <span className="home-archive-year">{era.year}</span>
      <div
        className="home-timeline-panel"
        data-side={index % 2 ? "right" : "left"}
      >
        <figure className="home-timeline-image">
          <img
            src={photo.image.src}
            srcSet={
              photo.image.small
                ? `${photo.image.small} ${photo.image.smallWidth || 640}w, ${photo.image.src} ${photo.image.width}w`
                : undefined
            }
            sizes="(max-width: 700px) 85vw, 58vw"
            width={photo.image.width}
            height={photo.image.height}
            alt={photo.image.alt}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="home-timeline-caption">
          <h3>{copy.title}</h3>
          <p>{copy.sentence}</p>
        </div>
        <details className="home-timeline-details">
          <summary>Story &amp; photo credits</summary>
          <div className="home-timeline-details-body">
            <p>
              {photo.caption}.{" "}
              <Link to={`/credits#${photo.credit}`}>
                Lead photograph credit
              </Link>
            </p>
            <p>{era.note}</p>
            <p>
              <strong>{era.achievement}</strong> · {era.achievementNote}.{" "}
              <a href={era.source} target="_blank" rel="noreferrer">
                Historical source
              </a>
            </p>
            <div className="home-timeline-evidence">
              {era.photos.map((item) => (
                <ArchiveFigure key={item.credit} photo={item} />
              ))}
            </div>
          </div>
        </details>
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
    onEra(index);
    window.scrollTo({
      top: Math.max(
        0,
        scrollY + target.getBoundingClientRect().top - scrollPadding - 24,
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
        <h2 id="home-archive-title">The road remembers.</h2>
        <nav className="home-archive-navigation" aria-label="GT-R eras">
          {eras.map((era, index) => (
            <button
              key={era.year}
              type="button"
              aria-label={`${era.year}: ${index === 0 ? "PGC10 " : ""}${era.name}`}
              aria-current={activeEra === index ? "step" : undefined}
              aria-controls={`home-era-${era.year}`}
              onClick={() => navigateEra(index)}
            >
              {era.generation}
            </button>
          ))}
        </nav>
      </header>
      <div className="home-archive-track">
        {eras.map((era, index) => (
          <ArchiveChapter key={era.year} index={index} />
        ))}
      </div>
      <Link className="home-archive-source" to="/credits#story-photography">
        Photography &amp; historical sources{" "}
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
