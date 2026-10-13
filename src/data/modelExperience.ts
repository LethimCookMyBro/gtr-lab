import type { VehicleModel } from "./models";

export function getModelExperience(model: VehicleModel) {
  if (model.asset.status === "ready" && model.asset.url)
    return { kind: "3d", action: "View in 3D" } as const;
  if (model.image)
    return { kind: "photography", action: "View photos" } as const;
  return { kind: "specifications", action: "View specifications" } as const;
}
