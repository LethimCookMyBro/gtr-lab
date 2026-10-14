import type { VehicleModel } from "../data/models";
import "../styles/image-reference.css";

/** Keep photographed season separate from catalog specifications. */
export function ImageReferenceLabel({ model }: { model: VehicleModel }) {
  return model.imageReferenceLabel ? (
    <span className="image-reference-label">{model.imageReferenceLabel}</span>
  ) : null;
}
