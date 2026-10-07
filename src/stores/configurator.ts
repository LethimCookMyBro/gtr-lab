import { create } from "zustand";
import { getModel } from "../data/models";
import { paints, environments, cameraPresets } from "../data/configuration";
import type { EnvironmentId } from "../data/configuration";
import type {
  CabinPreviewState,
  CabinSeat,
} from "../components/three/cabinPreview";
import type { HomeSceneLoadState } from "../components/home/homeReadiness";
export type Panel =
  "camera" | "environment" | "models" | "details" | "assets" | null;
interface ConfigState {
  cabin: CabinPreviewState;
  cabinRequest: number;
  beginCabin: () => void;
  cabinProgress: (request: number, progress: HomeSceneLoadState) => void;
  cabinReady: (request: number) => void;
  cabinFailed: (request: number, message: string) => void;
  setCabinSeat: (seat: CabinSeat) => void;
  exitCabin: (allowRotation: boolean) => void;
  selectedVariant: string;
  selectedPaint: string;
  selectedEnvironment: EnvironmentId;
  cameraPreset: string;
  cameraRequest: number;
  environmentRequest: number;
  autoRotate: boolean;
  lightsEnabled: boolean;
  audioEnabled: boolean;
  panel: Panel;
  ready: boolean;
  loadingProgress: number;
  error: string | null;
  selectVariant: (id: string) => void;
  setPaint: (id: string) => void;
  setEnvironment: (id: EnvironmentId) => void;
  setCamera: (id: string) => void;
  togglePanel: (id: Panel) => void;
  stopAutoRotate: () => void;
  reset: () => void;
  retryScene: () => void;
  notice: string | null;
  paintAvailable: boolean;
  lightsAvailable: boolean;
}
const initial = {
  cabin: { phase: "closed" } as CabinPreviewState,
  cabinRequest: 0,
  paintAvailable: false,
  lightsAvailable: false,
  notice: null as string | null,
  selectedVariant: "premium",
  selectedPaint: "silver",
  selectedEnvironment: "studio" as EnvironmentId,
  cameraPreset: "hero",
  cameraRequest: 0,
  environmentRequest: 0,
  autoRotate: false,
  lightsEnabled: false,
  audioEnabled: false,
  panel: null as Panel,
  ready: false,
  loadingProgress: 0,
  error: null as string | null,
};
export const useConfigurator = create<ConfigState>((set) => ({
  ...initial,
  beginCabin: () =>
    set((state) => {
      if (
        state.selectedVariant !== "premium" ||
        !state.ready ||
        state.error ||
        state.cabin.phase === "loading" ||
        state.cabin.phase === "active"
      )
        return {};
      const request = state.cabinRequest + 1;
      return {
        cabinRequest: request,
        cabin: {
          phase: "loading",
          request,
          progress: { phase: "downloading", loadedBytes: 0 },
        },
        panel: null,
      };
    }),
  cabinProgress: (request, progress) =>
    set((state) =>
      state.cabin.phase === "loading" && state.cabin.request === request
        ? { cabin: { ...state.cabin, progress } }
        : {},
    ),
  cabinReady: (request) =>
    set((state) =>
      state.cabin.phase === "loading" && state.cabin.request === request
        ? {
            cabin: {
              phase: "active",
              request,
              seat: "driver",
              resumeRotation: state.autoRotate,
            },
            autoRotate: false,
          }
        : {},
    ),
  cabinFailed: (request, message) =>
    set((state) =>
      state.cabin.phase !== "closed" && state.cabin.request === request
        ? {
            cabin: { phase: "error", request, message },
            autoRotate:
              state.cabin.phase === "active"
                ? state.cabin.resumeRotation
                : state.autoRotate,
          }
        : {},
    ),
  setCabinSeat: (seat) =>
    set((state) =>
      state.cabin.phase === "active" ? { cabin: { ...state.cabin, seat } } : {},
    ),
  exitCabin: (allowRotation) =>
    set((state) => ({
      cabin: { phase: "closed" },
      autoRotate:
        state.cabin.phase === "active"
          ? allowRotation && state.cabin.resumeRotation
          : state.autoRotate,
    })),
  selectVariant: (id) => {
    if (getModel(id))
      set({
        cabin: { phase: "closed" },
        selectedVariant: id,
        autoRotate: false,
        lightsEnabled: false,
        cameraPreset: "hero",
        ready: false,
        loadingProgress: 0,
        error: null,
        panel: null,
        notice: null,
        paintAvailable: false,
        lightsAvailable: false,
      });
  },
  setPaint: (id) => {
    if (paints.some((p) => p.id === id)) set({ selectedPaint: id });
  },
  setEnvironment: (id) => {
    if (environments.some((e) => e.id === id))
      set((state) => ({
        selectedEnvironment: id,
        notice: null,
        environmentRequest: state.environmentRequest + 1,
        ready: false,
        loadingProgress: 99,
      }));
  },
  setCamera: (id) => {
    if (cameraPresets.some((c) => c.id === id))
      set((state) => ({
        cabin: { phase: "closed" },
        cameraPreset: id,
        cameraRequest: state.cameraRequest + 1,
        autoRotate: false,
      }));
  },
  togglePanel: (panel) =>
    set((state) => ({ panel: state.panel === panel ? null : panel })),
  retryScene: () =>
    set({
      cabin: { phase: "closed" },
      selectedEnvironment: "studio",
      error: null,
      ready: false,
      loadingProgress: 0,
      autoRotate: false,
      notice: null,
    }),
  stopAutoRotate: () => set({ autoRotate: false }),
  reset: () => set(initial),
}));
