import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ImageReferenceLabel } from "../components/ImageReferenceLabel";
import { ReferenceUnavailable } from "../components/ReferenceUnavailable";
import { models } from "../data/models";
import { getModelExperience } from "../data/modelExperience";
export function ModelsPage() {
  return (
    <div className="models-page page-enter">
      <section className="models-heading">
        <h1>
          Choose your
          <br className="mobile-only" /> expression.
        </h1>
        <p>GT-R heritage. Electric competition.</p>
      </section>
      <div className="model-bands">
        {models.map((m, i) => (
          <Link
            className={"model-band model-band-" + m.id}
            key={m.id}
            to={"/configurator/" + m.id}
            aria-label={"Explore " + m.name}
            aria-describedby={`collection-action-${m.id}`}
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
              <ImageReferenceLabel model={m} />
            </div>
            <div className="band-action" id={`collection-action-${m.id}`}>
              {getModelExperience(m).action}
              <ArrowRight size={22} aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
      <p className="lineup-note">
        Photographs show specific model years. See model details for
        specifications and image context.
      </p>
    </div>
  );
}
