import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ReferenceUnavailable } from "../components/ReferenceUnavailable";
import { models } from "../data/models";
export function ModelsPage() {
  return (
    <div className="models-page page-enter">
      <section className="models-heading">
        <h1>
          Choose your
          <br className="mobile-only" /> expression.
        </h1>
        <p>
          GT-R heritage. Electric competition.
          <br />
          Six distinct perspectives.
        </p>
      </section>
      <div className="model-bands">
        {models.map((m, i) => (
          <Link
            className={"model-band model-band-" + m.id}
            key={m.id}
            to={"/configurator/" + m.id}
            aria-label={"Explore " + m.name}
          >
            <div className="band-image">
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.imageCaption}
                  style={{ objectPosition: m.imagePosition }}
                  loading={i > 1 ? "lazy" : "eager"}
                />
              ) : (
                <ReferenceUnavailable model={m} />
              )}
            </div>
            <div className="band-copy">
              <span className="model-index">
                0{i + 1} / {m.category}
              </span>
              <h2>{m.shortName}</h2>
              <p>{m.tagline}</p>
            </div>
            <div className="band-action">
              Explore
              <ArrowRight size={22} />
            </div>
          </Link>
        ))}
      </div>
      <p className="lineup-note">
        Photographs represent specific model years. Each model’s detail panel
        identifies its specification and image context. Formula E currently has
        specifications only; its reference image and 3D asset are unavailable.
      </p>
    </div>
  );
}
