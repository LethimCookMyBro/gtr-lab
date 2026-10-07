import type { CabinPreviewState } from "./cabinPreview";
import type { HomeSceneLoadState } from "../home/homeReadiness";
import type { MaterialRoles, CameraView } from "./sceneHelpers";

export type StudioEnvironment =
  "studio" | "gallery" | "night" | "forest" | "coast";
export type VehicleSceneProps = {
  url: string;
  cabin?: CabinPreviewState;
  onCabinReady?: (request: number) => void;
  onCabinError?: (request: number, message: string) => void;
  onCabinProgress?: (request: number, progress: HomeSceneLoadState) => void;
  paint: string;
  environment: StudioEnvironment;
  environmentRequest?: number;
  preset: string;
  cameraRequest?: number;
  autoRotate: boolean;
  lights: boolean;
  reducedMotion: boolean;
  materialRoles: MaterialRoles;
  disabledEmissive?: string[];
  cameraViews?: Partial<Record<string, CameraView>>;
  onReady: () => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
  onManual: () => void;
  onEnvironmentFallback?: (message: string) => void;
  onCapabilities?: (capabilities: { paint: boolean; lights: boolean }) => void;
};
