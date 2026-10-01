import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
export function HeritagePage() {
  return (
    <article className="heritage-page page-enter">
      <header className="editorial-heading">
        <h1>
          Never stop
          <br />
          refining.
        </h1>
        <p>
          The GT-R story is a pursuit.
          <br />
          Of balance. Of response. Of the next possibility.
        </p>
      </header>
      <figure className="heritage-photo">
        <img
          src="/images/gtr-tspec.webp"
          alt="2024 GT-R T-spec at a Nissan exhibition"
        />
        <figcaption>
          GT-R T-spec · 2024 · ShunyaIshiwatari / CC BY-SA 4.0
        </figcaption>
      </figure>
      <section className="heritage-story">
        <h2>
          More than a<br />
          badge.
        </h2>
        <div>
          <p>
            From the Skyline GT-R to the R35, the name has carried a simple
            idea: performance is a complete system. Engine, chassis,
            aerodynamics and driver must work together.
          </p>
          <p>
            The R35 gave that idea a new shape. Its front-mounted twin-turbo V6,
            rear transaxle and all-wheel-drive system became the foundations of
            a modern icon.
          </p>
          <a
            className="text-link underlined"
            href="https://usa.nissannews.com/en-US/releases/2024-nissan-gt-r-press-kit"
            target="_blank"
            rel="noreferrer"
          >
            Read Nissan’s GT-R story
            <ArrowUpRight size={18} />
          </a>
        </div>
      </section>
      <section id="engineering" className="engineering-section">
        <div className="section-heading">
          <h2>
            Engineering,
            <br />
            in conversation.
          </h2>
          <p>
            No isolated numbers.
            <br />A connected set of decisions.
          </p>
        </div>
        <div className="engineering-rows">
          <div>
            <span>01</span>
            <h3>The heart</h3>
            <p>
              The road-going R35’s VR38DETT is a 3.8-liter twin-turbo V6. In
              2024 US specification it produces 565 hp in Premium and T-spec, or
              600 hp in NISMO.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>The balance</h3>
            <p>
              A six-speed dual-clutch rear transaxle works with ATTESA E-TS
              all-wheel drive. Traction and weight distribution are part of the
              same conversation.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>The exception</h3>
            <p>
              Shared identity does not mean shared hardware. The 2020 GT500 is a
              purpose-built, rear-wheel-drive race car with a 2.0-liter turbo
              inline-four.
            </p>
          </div>
        </div>
      </section>
      <section className="closing-cta">
        <h2>Find your expression.</h2>
        <Link to="/models" className="outline-button">
          Explore all six models
          <ArrowRight size={18} />
        </Link>
      </section>
    </article>
  );
}
