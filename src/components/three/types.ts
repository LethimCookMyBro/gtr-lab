import type {
  CabinLayout,
  CabinPreviewState,
  CabinPreparationState,
  CabinWindowStatus,
} from "./cabinPreview";
import type { HomeSceneLoadState } from "../home/homeReadiness";
import type { MaterialRoles, CameraView } from "./sceneHelpers";

export type RenderQuality = "standard" | "reduced";

export type StudioEnvironment =
  "studio" | "gallery" | "night" | "forest" | "coast";
export type VehicleSceneProps = {
  url: string;
  renderQuality?: RenderQuality;
  cabin?: CabinPreviewState;
  cabinLayout?: CabinLayout;
  cabinPreparation?: CabinPreparationState;
  cabinPreparationAllowed?: boolean;
  onWindowStatus?: (status: CabinWindowStatus) => void;
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
  onRenderPending?: (pending: boolean) => void;
  onProgress: (progress: number) => void;
  onManual: () => void;
  onEnvironmentFallback?: (message: string) => void;
  onCapabilities?: (capabilities: { paint: boolean; lights: boolean }) => void;
};
