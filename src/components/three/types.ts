import type { MaterialRoles, CameraView } from "./sceneHelpers";

export type StudioEnvironment =
  "studio" | "gallery" | "night" | "forest" | "coast";
export type VehicleSceneProps = {
  url: string;
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
