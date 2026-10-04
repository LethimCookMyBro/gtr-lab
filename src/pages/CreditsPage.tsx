import { imageCredits, models } from "../data/models";
import homeMedia from "../data/home-media-credits.json";
import { homeFilms } from "../data/films";
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
      <section id="environments">
        <h2>3D environments</h2>
        <p>
          Original modelled spaces: pit garage, gallery, after-hours workshop,
          test paddock and coastal road. Floors, buildings, barriers and terrain
          have real geometry. These designed locations are not scans of a named
          circuit.
        </p>
        <p>
          Scanned PBR material maps and the distant sky are self-hosted CC0
          assets from Poly Haven:
        </p>
        <ul>
          <li>
            <a href="https://polyhaven.com/a/garage_floor">Garage Floor</a> ·
            Jenelle van Heerden
          </li>
          <li>
            <a href="https://polyhaven.com/a/concrete_wall_008">
              Concrete Wall 008
            </a>{" "}
            · Charlotte Baglioni and Dario Barresi
          </li>
          <li>
            <a href="https://polyhaven.com/a/asphalt_pit_lane">
              Asphalt Pit Lane
            </a>{" "}
            · Dimitrios Savva
          </li>
          <li>
            <a href="https://polyhaven.com/a/aerial_rocks_02">
              Aerial Rocks 02
            </a>{" "}
            · Rob Tuytel
          </li>
          <li>
            <a href="https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky">
              Kloofendal 48d Partly Cloudy (Pure Sky)
            </a>{" "}
            · Greg Zaal and Jarod Guest
          </li>
        </ul>
        <p>
          <a href="https://polyhaven.com/a/rock_moss_set_01">
            Rock Moss Set 01
          </a>{" "}
          · Kless Gyzen. Six original metre-scaled rock scans, shared across
          outdoor placements.
        </p>
        <a href="https://polyhaven.com/license">
          Poly Haven · CC0 asset license
        </a>
        <p>
          Original 1K files; material tiling and lighting are adjusted in the
          renderer. Photographic road panoramas are no longer used as scenery or
          ground. The vehicle remains the separately credited licensed Ciasny
          exterior.
        </p>
      </section>
      <section id="brand-marks">
        <h2>Brand marks & typography</h2>
        <p>
          Nissan and GT-R names and logos are trademarks of Nissan Motor Co.,
          Ltd. They identify the subject of this independent enthusiast project;
          no manufacturer endorsement or trademark license is implied.
        </p>
        <p>
          The stacked chrome GT / red R badge is the supplied reference image,
          displayed in its original proportions and colors. Its copyright
          permission has not been verified. The 2001–2020 chrome Nissan emblem
          is an unmodified SVG from Wikimedia Commons, which classifies that
          file as PD-textlogo and separately warns of trademark restrictions.
          That classification does not grant Nissan approval or trademark
          rights.
        </p>
        <a
          href="https://commons.wikimedia.org/wiki/File:Nissan_logo_2001.svg"
          target="_blank"
          rel="noreferrer"
        >
          Nissan emblem · source and trademark notice
        </a>
        <p>
          Headings use Barlow Condensed Bold by Jeremy Tribby and the Barlow
          Project Authors, self-hosted without modification under the SIL Open
          Font License 1.1. Body copy retains DM Sans. No official Nissan
          typeface is claimed.
        </p>
        <a href="/fonts/barlow-condensed/OFL.txt">
          Barlow Condensed · SIL Open Font License
        </a>
        <span> · </span>
        <a href="/brand/ATTRIBUTION.txt">Brand asset provenance</a>
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
            <div key={c.id} id={`photography-${c.id}`}>
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
            <div key={asset.id} id={asset.id}>
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
                <p>
                  Photograph by{" "}
                  <a href={asset.authorUrl} target="_blank" rel="noreferrer">
                    {asset.author}
                  </a>
                </p>
                <p>Photo date: {asset.photoDate}</p>
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Original source for ${asset.caption}`}
                >
                  Original source
                </a>
                <span> · </span>
                <a href={asset.licenseUrl} target="_blank" rel="noreferrer">
                  {asset.license}
                </a>
                <p>{asset.framingNote}</p>
                <details>
                  <summary>Image changes & reuse</summary>
                  <p>{asset.credit}</p>
                  {asset.license.startsWith("CC BY-SA") && (
                    <p>
                      These display copies and any image adaptations are
                      released under the same{" "}
                      <a
                        href={asset.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {asset.license}
                      </a>{" "}
                      license as the source photograph.
                    </p>
                  )}
                  <ul>
                    {asset.derivatives.map((copy) => (
                      <li key={copy.path}>
                        <a href={copy.path}>
                          {copy.width} × {copy.height} display copy
                        </a>
                        : {copy.changes.join("; ")}. License:{" "}
                        <a
                          href={copy.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.license}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p>No photographer or manufacturer endorsement is implied.</p>
                </details>
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
        <h2>Track films · NissanNews / Flixel</h2>
        <p>
          Real GT-R track footage is presented through the intact
          publisher-provided Flixel players. Copyright remains with Nissan and
          the respective creators. These clips depict the 2020 GT-R NISMO and
          its camera car; they do not represent every model year or configurator
          variant on this independent site.
        </p>
        {Object.entries(homeFilms).map(([kind, film]) => (
          <div className="source-row" key={kind}>
            <h3>
              {kind === "hero" ? "Opening film" : "Expanding film"}:{" "}
              {film.title}
            </h3>
            <p>{film.description}.</p>
            <a href={film.page} target="_blank" rel="noreferrer">
              NissanNews · original hosted film
            </a>
            <span> · </span>
            <a href={film.article} target="_blank" rel="noreferrer">
              Publisher context
            </a>
          </div>
        ))}
        <p>
          Each public film page supplies an Embed dialog for website use. This
          is limited to those hosted players; no video file is extracted,
          rehosted, sold or offered for download. No broader license or
          manufacturer endorsement is claimed. Stop film unloads the player;
          playing again restarts the provider loop. A still photograph remains
          available when motion is disabled or the external player cannot load.
        </p>
        <a href="https://flixel.com/terms/" target="_blank" rel="noreferrer">
          Flixel terms
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
      <section id="models">
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
