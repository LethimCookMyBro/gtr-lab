import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { models } from "../../data/models";
import { getModelExperience } from "../../data/modelExperience";
import { ReferenceUnavailable } from "../ReferenceUnavailable";
import { campaignMedia } from "./campaignMedia";
import "../../styles/home-opening-cards.css";

export function ModelInvitations() {
  return (
    <section
      id="home-lineup"
      className="home-invitations"
      data-motion-section="lineup"
      aria-labelledby="home-models-title"
    >
      <header>
        <h2 id="home-models-title">Explore the collection.</h2>
      </header>
      <nav aria-label="Explore all six models">
        {models.map((model) => {
          const { kind, action } = getModelExperience(model);
          const has3D = kind === "3d";
          return (
            <Link
              key={model.id}
              to={`/configurator/${model.id}`}
              className={`home-model-invitation home-model-invitation--${model.id}`}
              aria-label={`Explore ${model.shortName}: ${action}`}
              data-motion-anchor={`model-${model.id}`}
              data-experience={kind}
            >
              {model.image ? (
                <img
                  src={has3D ? campaignMedia.premium.src : model.image}
                  srcSet={
                    has3D
                      ? `${campaignMedia.premium.small} 640w, ${campaignMedia.premium.src} 1600w`
                      : `/images/gtr-${model.id}.small.webp 800w, ${model.image} 1920w`
                  }
                  sizes="(max-width: 700px) 92vw, 46vw"
                  alt={has3D ? campaignMedia.premium.alt : model.imageCaption}
                  style={{
                    objectPosition: has3D
                      ? campaignMedia.premium.position
                      : model.imagePosition,
                  }}
                  loading="lazy"
                />
              ) : (
                <ReferenceUnavailable model={model} />
              )}
              <div className="home-invitation-copy">
                <h3>{model.shortName}</h3>
              </div>
              <span className="home-invitation-cta">
                <span>{action}</span>
                <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
