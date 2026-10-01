import { imageCredits, models } from "../data/models";
export function CreditsPage() {
  return (
    <article className="credits-page page-enter">
      <h1>Credits & sources.</h1>
      <p className="intro">
        An independent exploration, built with respect for the people who make
        and document these machines.
      </p>
      <section>
        <h2>Independent project</h2>
        <p>
          GT-R LAB is a non-commercial fan-made design and engineering
          exploration. It is not affiliated with, authorized by or endorsed by
          Nissan Motor Co., NISMO, Italdesign or Porsche. Vehicle names and
          trademarks identify their respective subjects and owners.
        </p>
      </section>
      <section>
        <h2>Photography</h2>
        <p>
          Each photograph retains its original license. Display copies are
          resized and compressed; framing may be cropped through CSS. Specific
          model years and concept vehicles are identified below.
        </p>
        <div className="credit-list">
          {imageCredits.map((c) => (
            <div key={c.id}>
              <img
                src={"/images/gtr-" + c.id + ".small.webp"}
                alt={c.description}
                loading="lazy"
              />
              <div>
                <h3>{c.description}</h3>
                <p>Photograph by {c.author}</p>
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                  Original source
                </a>
                <span> · </span>
                <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                  {c.license}
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section id="generated">
        <h2>Illustrative imagery</h2>
        <p>
          The silver R35 studio hero is an AI-generated illustration produced
          for GT-R LAB. It is not Nissan campaign photography, a specification
          reference or a real-time 3D rendering. Model lineup photographs are
          actual vehicles with attribution above.
        </p>
      </section>
      <section>
        <h2>Technical specifications</h2>
        <p>
          Figures are specific to the model year and market shown. hp and PS are
          different units. Racing outputs are subject to regulations and Balance
          of Performance.
        </p>
        {models.map((m) => (
          <div className="source-row" key={m.id}>
            <h3>{m.name}</h3>
            <p>{m.modelYear}</p>
            {m.sourceUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                Manufacturer source {i + 1}
              </a>
            ))}
          </div>
        ))}
      </section>
      <section>
        <h2>3D assets</h2>
        <p>
          Only licensed vehicle assets with recorded provenance are eligible for
          the live viewer. If a model is unavailable, the configurator displays
          a clearly marked photographic reference rather than substituting
          another variant or a primitive mesh.
        </p>
        {models
          .filter((m) => m.asset.status === "ready")
          .map((m) => (
            <div className="source-row" key={m.id}>
              <h3>{m.asset.displayName || m.name}</h3>
              {m.asset.source && (
                <a href={m.asset.source} target="_blank" rel="noreferrer">
                  {m.asset.author} · Original 3D model
                </a>
              )}
              {m.asset.license && (
                <a href={m.asset.license} target="_blank" rel="noreferrer">
                  {m.asset.licenseName || "Asset license"}
                </a>
              )}
              <p>{m.asset.referenceNote}</p>
              {m.asset.changes?.map((change) => (
                <p key={change}>{change}</p>
              ))}
            </div>
          ))}
      </section>
      <section>
        <h2>Original implementation</h2>
        <p>
          Experience research used Porsche Lab as an interaction benchmark. No
          Porsche source code, branding or vehicle assets are included. Sound
          cues are original, synthesized locally after user interaction.
        </p>
      </section>
    </article>
  );
}
