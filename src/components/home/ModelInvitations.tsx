import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { models } from "../../data/models";
export function ModelInvitations() {
  return (
    <section
      id="home-lineup"
      className="home-invitations"
      data-motion-section="lineup"
      aria-labelledby="home-models-title"
    >
      <header>
        <h2 id="home-models-title">
          Six expressions.
          <br />
          One obsession.
        </h2>
      </header>
      <nav aria-label="Explore all six models">
        {models.map((model, index) => (
          <Link
            key={model.id}
            to={`/configurator/${model.id}`}
            className={`home-model-invitation home-model-invitation--${model.id}`}
            aria-label={`Explore ${model.shortName}`}
            data-motion-anchor={`model-${model.id}`}
          >
            <img
              src={model.image}
              srcSet={`/images/gtr-${model.id}.small.webp 800w, ${model.image} 1920w`}
              sizes="(max-width: 700px) 92vw, 46vw"
              alt={model.imageCaption}
              style={{ objectPosition: model.imagePosition }}
              loading="lazy"
            />
            <span className="home-invitation-meta">
              {String(index + 1).padStart(2, "0")} / {model.category}
            </span>
            <div className="home-invitation-copy">
              <h3>{model.shortName}</h3>
              <p>{model.tagline}</p>
            </div>
            <span className="home-invitation-cta">
              <span>Explore {model.shortName}</span>
              <ArrowRight size={28} strokeWidth={1.5} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
