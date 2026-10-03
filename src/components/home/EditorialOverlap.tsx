import { Link } from "react-router-dom";
import { storyMedia } from "./storyMedia";
export function EditorialOverlap() {
  return (
    <section
      className="home-editorial"
      data-motion-section="editorial"
      aria-labelledby="form-title"
    >
      <div className="home-editorial-layout">
        <div
          className="home-editorial-copy home-editorial-copy--form"
          data-motion-anchor="form"
          data-motion-stage="heading"
          data-motion-enter-with="detail"
        >
          <h2 id="form-title">
            Form follows
            <br />
            obsession.
          </h2>
          <p>
            Every line has a purpose.
            <br />
            Every detail, a reason to exist.
          </p>
        </div>
        <figure
          className="home-editorial-image home-editorial-image--detail"
          data-motion-anchor="detail"
          data-motion-stage="media"
        >
          <img
            src={storyMedia.detail.src}
            srcSet={`${storyMedia.detail.small} 800w, ${storyMedia.detail.src} 1920w`}
            sizes="(max-width: 700px) 90vw, 52vw"
            alt={storyMedia.detail.alt}
            width={1920}
            height={1407}
            loading="lazy"
            style={{ objectPosition: storyMedia.detail.position }}
          />
        </figure>
        <figure
          className="home-editorial-image home-editorial-image--cockpit"
          data-motion-anchor="cockpit"
          data-motion-stage="media"
        >
          <img
            src={storyMedia.cockpit.src}
            srcSet={`${storyMedia.cockpit.small} 480w, ${storyMedia.cockpit.src} 1200w`}
            sizes="(max-width: 700px) 80vw, 50vw"
            alt={storyMedia.cockpit.alt}
            width={1200}
            height={1600}
            loading="lazy"
          />
          <figcaption>
            <Link to="/credits#story-photography">
              2017 GT-R Premium Edition · Photography credits
            </Link>
          </figcaption>
        </figure>
        <div
          className="home-editorial-copy home-editorial-copy--control"
          data-motion-anchor="control"
          data-motion-stage="heading"
          data-motion-enter-with="cockpit"
        >
          <h2>
            Control without
            <br />
            compromise.
          </h2>
          <p>A connection between driver, machine and every metre ahead.</p>
        </div>
      </div>
    </section>
  );
}
