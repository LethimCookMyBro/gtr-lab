import { CABIN_URL, type CabinPreparationState } from "./cabinPreview";
import type { HomeSceneLoadState } from "../home/homeReadiness";
import { useVehicleAsset } from "./useVehicleAsset";

/** A view change is deliberately absent from this route-owned load identity. */
export function useResidentCabinAsset(
  preparation: CabinPreparationState | undefined,
  onError?: (request: number, message: string) => void,
  onProgress?: (request: number, state: HomeSceneLoadState) => void,
) {
  const request =
    preparation && preparation.phase !== "idle" ? preparation.request : 0;
  const resident =
    preparation?.phase === "loading" || preparation?.phase === "ready";
  return useVehicleAsset(
    resident ? CABIN_URL : null,
    { paint: [], headlights: [], taillights: [] },
    () => {},
    (message) => onError?.(request, message),
    [],
    (state) => onProgress?.(request, state),
    true,
    request,
  );
}
