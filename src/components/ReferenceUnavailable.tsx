import type { VehicleModel } from "../data/models";
import "../styles/reference-unavailable.css";

/** Text-only asset state. No vehicle likeness or remote media is implied. */
export function ReferenceUnavailable({ model }: { model: VehicleModel }) {
  return (
    <div className="reference-unavailable">
      <span className="reference-unavailable-label">
        Reference image unavailable
      </span>
      <span className="reference-unavailable-context">{model.modelYear}</span>
    </div>
  );
}
