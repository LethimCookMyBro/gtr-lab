import { Link } from "react-router-dom";
import { ArrowRight, Box } from "lucide-react";
import type { VehicleModel } from "../../data/models";

export function AssetDisclosure({
  model,
  interactive,
}: {
  model: VehicleModel;
  interactive: boolean;
}) {
  const study = model.asset.kind === "original-study";
  const ready = model.asset.status === "ready";
  const title = interactive
    ? study
      ? model.asset.displayName || "An original design study."
      : model.asset.displayName || "A real-time perspective."
    : ready
      ? "A rendering interruption."
      : "The right model comes first.";
  const description = interactive
    ? study
      ? "This live WebGL model is an original R35-inspired approximation. It is not manufacturer geometry, a dimensional replica, or a verified representation of a particular production variant."
      : "This view uses a licensed GLB vehicle asset rendered live in WebGL."
    : ready
      ? "A 3D asset is available, but this view is not yet interactive. Allow loading to complete or retry after a rendering error. Any photographic fallback is identified separately."
      : "A production-quality, licensed 3D asset for " +
        model.name +
        " has not been integrated yet. The current view is a clearly marked photograph, not an interactive render.";
  return (
    <div className="asset-explanation">
      <Box size={35} />
      <h3>{title}</h3>
      <p>{description}</p>
      {model.asset.referenceNote && <p>{model.asset.referenceNote}</p>}
      {model.asset.kind === "licensed-model" && model.asset.source && (
        <p>
          <a href={model.asset.source} target="_blank" rel="noreferrer">
            {model.asset.author} · Original model
          </a>
          {model.asset.license && (
            <>
              {" "}
              ·{" "}
              <a href={model.asset.license} target="_blank" rel="noreferrer">
                {model.asset.licenseName || "License"}
              </a>
            </>
          )}
        </p>
      )}
      {study && !interactive && (
        <p>
          {model.asset.displayName}. Original approximate geometry; not
          manufacturer geometry.
        </p>
      )}
      {model.asset.limitations?.length ? (
        <ul>
          {model.asset.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>
          Exterior geometry, detailed cabin, separated paint and light materials
          must all be verified before the complete experience can be enabled.
        </p>
      )}
      <dl>
        <div>
          <dt>Photography</dt>
          <dd>Available · attributed</dd>
        </div>
        <div>
          <dt>Vehicle geometry</dt>
          <dd>
            {ready
              ? study
                ? "Original approximation"
                : "Available"
              : "Pending licensed asset"}
          </dd>
        </div>
        <div>
          <dt>Detailed interior</dt>
          <dd>
            {model.asset.interior
              ? study
                ? "Modeled study cabin"
                : "Verified"
              : "Unavailable in this asset"}
          </dd>
        </div>
        <div>
          <dt>Headlight materials</dt>
          <dd>{model.asset.lights ? "Available" : "Not yet verified"}</dd>
        </div>
      </dl>
      <Link to="/credits" className="text-link underlined">
        Credits & asset policy
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
