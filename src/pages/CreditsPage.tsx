import { imageCredits, models } from "../data/models";
import homeMedia from "../data/home-media-credits.json";
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
      <section id="story-photography">
        <h2>Heritage & editorial photography</h2>
        <p>{homeMedia.historicalCaution}</p>
        <div className="credit-list">
          {homeMedia.assets.map((asset) => (
            <div key={asset.id}>
              <img
                src={
                  asset.derivatives.find((copy) =>
                    copy.path.endsWith("-small.webp"),
                  )?.path
                }
                alt={asset.alt}
                loading="lazy"
              />
              <div>
                <h3>{asset.caption}</h3>
                <p>Photograph by {asset.author}</p>
                <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
                  Original source
                </a>
                <span> · </span>
                <a href={asset.licenseUrl} target="_blank" rel="noreferrer">
                  {asset.license}
                </a>
                <p>
                  Display copies are resized, compressed and cropped where
                  stated. The cockpit derivatives remain CC BY-SA 4.0. No
                  photographer or manufacturer endorsement is implied.
                </p>
              </div>
            </div>
          ))}
        </div>
        {homeMedia.historySources.map((source) => (
          <p key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.supports}
            </a>
          </p>
        ))}
      </section>
      <section id="films">
        <h2>Original CGI films</h2>
        <p>
          The two eight-second films use original GT-R LAB camera animation,
          studio lighting, silver materials and editing around Ciasny’s licensed
          R35 exterior. The source vehicle geometry and normals are preserved.
          These are CGI visual studies, not Nissan campaign footage or
          factory-accurate trim scans. No interior has been added.
        </p>
        <a
          href="https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a"
          target="_blank"
          rel="noreferrer"
        >
          Ciasny · original exterior
        </a>
        <span> · </span>
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
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
        <h2>Software & typography</h2>
        <p>
          Open-source rendering, interface and font credits are preserved in the
          complete distribution notices.
        </p>
        <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">
          Read software and font license notices
        </a>
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
