import { ArrowUpRight } from "lucide-react";
import type { VehicleModel } from "../../data/models";
export function ModelDetails({ model }: { model: VehicleModel }) {
  return (
    <div className="model-details">
      <img src={model.image} alt={model.imageCaption} />
      <p className="photo-caption">{model.imageCaption}</p>
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
            {model.outputIsEstimate ? "Estimated power" : "Published power"}
          </span>
        </div>
        <div>
          <strong>
            {model.torqueValue}
            <small>{model.torqueUnit}</small>
          </strong>
          <span>
            {model.outputIsEstimate ? "Estimated torque" : "Published torque"}
          </span>
        </div>
      </div>
      <p className="spec-context">{model.modelYear}</p>
      <dl>
        <div>
          <dt>Engine</dt>
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
            Manufacturer source {i + 1}
            <ArrowUpRight size={15} />
          </a>
        ))}
      </div>
    </div>
  );
}
