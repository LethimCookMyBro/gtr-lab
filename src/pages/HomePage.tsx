import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown, ArrowUpRight } from "lucide-react";
import { models } from "../data/models";
export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <img
          className="hero-image"
          src="/images/hero-silver-r35.webp"
          alt="Illustrative silver Nissan GT-R R35 in a dark architectural studio"
          fetchPriority="high"
        />
        <div className="hero-copy">
          <h1>
            Engineered
            <br />
            to defy.
          </h1>
          <p>An independent exploration of the GT-R.</p>
          <Link to="/models" className="text-link">
            Explore the models
            <ArrowRight size={20} />
          </Link>
        </div>
        <a href="#legacy" className="scroll-cue">
          <span />
          <span>Scroll to explore</span>
          <ArrowDown size={14} />
        </a>
        <Link to="/credits#generated" className="image-note">
          Illustrative CGI
        </Link>
      </section>
      <section id="legacy" className="legacy-section">
        <img
          src="/images/gtr-nismo.webp"
          alt="2024 Nissan GT-R NISMO rear with signature circular taillights"
          loading="lazy"
        />
        <div className="legacy-copy">
          <h2>
            A lineage without
            <br />
            compromise.
          </h2>
          <p>
            Built on a restless pursuit of performance.
            <br />
            From the road to the circuit, every evolution has a purpose.
          </p>
          <div className="link-row">
            <Link to="/heritage" className="text-link underlined">
              Discover the heritage
              <ArrowRight size={18} />
            </Link>
            <Link to="/heritage#engineering" className="text-link underlined">
              Explore the engineering
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="home-lineup">
        <div className="section-heading">
          <h2>
            Six expressions.
            <br />
            One obsession.
          </h2>
          <Link to="/models" className="text-link underlined">
            View the collection
            <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="home-model-rail">
          {models.slice(0, 3).map((m, i) => (
            <Link
              key={m.id}
              to={"/configurator/" + m.id}
              className="home-model"
            >
              <img
                src={m.image}
                alt={m.imageCaption}
                loading="lazy"
                style={{ objectPosition: m.imagePosition }}
              />
              <div>
                <span className="model-index">0{i + 1}</span>
                <h3>{m.shortName}</h3>
                <p>{m.tagline}</p>
                <ArrowUpRight className="model-arrow" size={22} />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="closing-cta">
        <p>Every detail. Your perspective.</p>
        <h2>Enter the lab.</h2>
        <Link to="/configurator/premium" className="outline-button">
          Explore the configurator
          <ArrowRight size={20} />
        </Link>
      </section>
    </div>
  );
}
