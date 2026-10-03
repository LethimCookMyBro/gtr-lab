import "../../styles/home-opening-cards.css";

/** CSS-metal type mark. Static by default; animation is reserved for the opening. */
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
      <span className="gtr-metal-nissan" aria-hidden="true">
        NISSAN
      </span>
      <span className="gtr-metal-letters" aria-hidden="true">
        <span>GT-</span>
        <b>R</b>
      </span>
    </div>
  );
}
