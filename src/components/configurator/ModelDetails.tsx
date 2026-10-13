import { ArrowUpRight } from "lucide-react";
import type { VehicleModel } from "../../data/models";
import "../../styles/reference-unavailable.css";
export function ModelDetails({ model }: { model: VehicleModel }) {
  return (
    <div className="model-details">
      {model.image ? (
        <>
          <img src={model.image} alt={model.imageCaption} />
          <p className="photo-caption">{model.imageCaption}</p>
        </>
      ) : (
        <p className="reference-unavailable-note">
          Reference image unavailable
        </p>
      )}
      <p className="detail-lead">{model.description}</p>
      {model.asset.referenceNote && (
        <p className="availability-note">{model.asset.referenceNote}</p>
      )}
      <div className="key-figures">
        <div>
          <strong>
            {model.powerValue}
            <small>{model.powerUnit}</small>
          </strong>
          <span>
            {model.powerLabel ??
              (model.outputIsEstimate ? "Estimated power" : "Published power")}
          </span>
        </div>
        <div>
          {model.torqueValue === null ? (
            <strong className="unknown-figure">Not specified in source</strong>
          ) : (
            <strong>
              {model.torqueValue}
              <small>{model.torqueUnit}</small>
            </strong>
          )}
          <span>
            {model.torqueValue === null
              ? "Torque"
              : model.outputIsEstimate
                ? "Estimated torque"
                : "Published torque"}
          </span>
        </div>
      </div>
      <p className="spec-context">{model.modelYear}</p>
      <dl>
        <div>
          <dt>{model.engineLabel ?? "Engine"}</dt>
          <dd>{model.engine}</dd>
        </div>
        <div>
          <dt>Drivetrain</dt>
          <dd>{model.drive}</dd>
        </div>
        <div>
          <dt>Transmission</dt>
          <dd>{model.transmission}</dd>
        </div>
        <div>
          <dt>Purpose</dt>
          <dd>
            {model.purpose ??
              (model.category === "Track"
                ? "Circuit competition"
                : model.category === "Bespoke"
                  ? "Limited-production coachbuilding"
                  : "Road-going performance")}
          </dd>
        </div>
      </dl>
      <div className="detail-notes">
        {model.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      <div className="detail-sources">
        {model.sourceUrls.map((url, i) => (
          <a href={url} key={url} target="_blank" rel="noreferrer">
            {model.id === "formula-e"
              ? "Primary source"
              : "Manufacturer source"}{" "}
            {i + 1}
            <ArrowUpRight size={15} />
          </a>
        ))}
      </div>
    </div>
  );
}
