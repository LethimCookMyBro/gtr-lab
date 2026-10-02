import { Link } from "react-router-dom";
import { ArrowDown } from "lucide-react";
import { storyMedia } from "./storyMedia";
export function RearSignature() {
  return (
    <section
      className="home-signature-runway"
      data-motion-section="signature"
      aria-label="The GT-R rear-light signature"
    >
      <div className="home-signature-sticky">
        <div className="home-signature-rings" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="home-signature-photo">
          <img
            src={storyMedia.detail.src}
            srcSet={`${storyMedia.detail.small} 800w, ${storyMedia.detail.src} 1920w`}
            sizes="100vw"
            width={1920}
            height={1407}
            alt="Rear three-quarter photograph of a 2024 Nissan GT-R NISMO at the New York auto show"
            loading="lazy"
          />
        </div>
        <div className="home-signature-intro">
          <p>A signature that stays with you.</p>
          <h2>
            Four circles.
            <br />
            One obsession.
          </h2>
        </div>
        <div className="home-signature-mark" aria-hidden="true">
          GT-R LAB
          <span />
        </div>
        <div className="home-signature-footer">
          <Link to="/credits#story-photography">
            2024 GT-R NISMO · Photography credits
          </Link>
          <a href="#home-lineup">
            Meet the family <ArrowDown size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
