import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { models } from "../../data/models";
export function ModelInvitations() {
  return (
    <section
      id="home-lineup"
      className="home-invitations"
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
        {models.map((model) => (
          <Link
            key={model.id}
            to={`/configurator/${model.id}`}
            className={`home-model-invitation home-model-invitation--${model.id}`}
            aria-label={`Explore ${model.shortName}`}
          >
            <img
              src={model.image}
              srcSet={`/images/gtr-${model.id}.small.webp 800w, ${model.image} 1920w`}
              sizes="100vw"
              alt={model.imageCaption}
              style={{ objectPosition: model.imagePosition }}
              loading="lazy"
            />
            <h3>{model.shortName}</h3>
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
