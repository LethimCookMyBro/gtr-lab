import "../../styles/home-opening-cards.css";

/** Original image marks, never recreated with type. See /brand/ATTRIBUTION.txt. */
export function GtrWordmark({
  sweep = false,
  className = "",
}: {
  sweep?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`gtr-metal-wordmark ${className}`}
      data-sweep={sweep}
      role="img"
      aria-label="Nissan GT-R"
    >
      <img
        className="gtr-brand-nissan"
        src="/brand/nissan-2001.svg"
        width="850"
        height="727"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      <span className="gtr-brand-badge-frame" aria-hidden="true">
        <img
          className="gtr-brand-badge"
          src="/brand/gtr-stacked-badge.png"
          width="640"
          height="640"
          alt=""
          draggable="false"
        />
      </span>
    </div>
  );
}
