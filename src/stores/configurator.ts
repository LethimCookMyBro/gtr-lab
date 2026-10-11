import { create } from "zustand";
import { getModel } from "../data/models";
import { paints, environments, cameraPresets } from "../data/configuration";
import type { EnvironmentId } from "../data/configuration";
import type { RenderQuality } from "../components/three/types";
import type {
  CabinPreviewState,
  CabinPreparationState,
  CabinSeat,
} from "../components/three/cabinPreview";
import type { HomeSceneLoadState } from "../components/home/homeReadiness";
export type Panel =
  "camera" | "environment" | "models" | "details" | "assets" | null;
interface ConfigState {
  renderQuality: RenderQuality;
  setRenderQuality: (quality: RenderQuality) => void;
  cabin: CabinPreviewState;
  cabinPreparation: CabinPreparationState;
  cabinRequest: number;
  cabinPreparationStartedAt: number | null;
  cabinPreparationReadyAt: number | null;
  cabinEntryRequestedAt: number | null;
  prepareCabin: () => void;
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
  sceneRequest: number;
  notice: string | null;
  paintAvailable: boolean;
  lightsAvailable: boolean;
}
const initial = {
  renderQuality: "standard" as RenderQuality,
  cabin: { phase: "closed" } as CabinPreviewState,
  cabinPreparation: { phase: "idle" } as CabinPreparationState,
  cabinRequest: 0,
  cabinPreparationStartedAt: null as number | null,
  cabinPreparationReadyAt: null as number | null,
  cabinEntryRequestedAt: null as number | null,
  paintAvailable: false,
  lightsAvailable: false,
  notice: null as string | null,
  selectedVariant: "premium",
  selectedPaint: "silver",
  selectedEnvironment: "studio" as EnvironmentId,
  cameraPreset: "hero",
  cameraRequest: 0,
  sceneRequest: 0,
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
  // A visit-only viewer choice: model, environment and retry do not reset it.
  setRenderQuality: (renderQuality) => {
    if (renderQuality === "standard" || renderQuality === "reduced")
      set({ renderQuality });
  },
  prepareCabin: () =>
    set((state) => {
      if (
        state.selectedVariant !== "premium" ||
        !state.ready ||
        state.error ||
        state.cabinPreparation.phase === "loading" ||
        state.cabinPreparation.phase === "ready"
      )
        return {};
      const request = state.cabinRequest + 1;
      return {
        cabinRequest: request,
        cabinPreparationStartedAt: performance.now(),
        cabinPreparationReadyAt: null,
        cabinEntryRequestedAt: null,
        cabinPreparation: {
          phase: "loading",
          request,
          progress: { phase: "downloading", loadedBytes: 0 },
        },
      };
    }),
  beginCabin: () =>
    set((state) => {
      if (
        state.selectedVariant !== "premium" ||
        !state.ready ||
        state.error ||
        state.cabinPreparation.phase !== "ready" ||
        state.cabin.phase === "active"
      )
        return {};
      const entryRequestedAt = performance.now();
      try {
        performance.mark?.("gtr-cabin-entry-request", {
          startTime: entryRequestedAt,
          detail: { request: state.cabinPreparation.request },
        });
      } catch {
        /* Optional timing never changes interaction. */
      }
      return {
        cabinEntryRequestedAt: entryRequestedAt,
        cabin: {
          phase: "active",
          request: state.cabinPreparation.request,
          seat: "driver",
          resumeRotation: state.autoRotate,
        },
        autoRotate: false,
        panel: null,
      };
    }),
  cabinProgress: (request, progress) =>
    set((state) =>
      state.cabinPreparation.phase === "loading" &&
      state.cabinPreparation.request === request
        ? { cabinPreparation: { ...state.cabinPreparation, progress } }
        : {},
    ),
  cabinReady: (request) =>
    set((state) => {
      if (
        state.cabinPreparation.phase !== "loading" ||
        state.cabinPreparation.request !== request
      )
        return {};
      const readyAt = performance.now();
      if (state.cabinPreparationStartedAt !== null) {
        try {
          performance.measure?.("gtr-cabin-preparation-ready", {
            start: state.cabinPreparationStartedAt,
            end: readyAt,
            detail: { request },
          });
        } catch {
          /* Optional timing never changes readiness. */
        }
      }
      return {
        cabinPreparation: { phase: "ready", request },
        cabinPreparationReadyAt: readyAt,
      };
    }),
  cabinFailed: (request, message) =>
    set((state) =>
      state.cabinPreparation.phase !== "idle" &&
      state.cabinPreparation.request === request
        ? {
            cabinPreparation: { phase: "error", request, message },
            cabin: { phase: "closed" },
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
      set((state) => ({
        sceneRequest: state.sceneRequest + 1,
        cabin: { phase: "closed" },
        cabinPreparation: { phase: "idle" },
        cabinPreparationStartedAt: null,
        cabinPreparationReadyAt: null,
        cabinEntryRequestedAt: null,
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
      }));
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
    set((state) => ({
      sceneRequest: state.sceneRequest + 1,
      cabin: { phase: "closed" },
      cabinPreparation: { phase: "idle" },
      cabinPreparationStartedAt: null,
      cabinPreparationReadyAt: null,
      cabinEntryRequestedAt: null,
      selectedEnvironment: "studio",
      error: null,
      ready: false,
      loadingProgress: 0,
      autoRotate: false,
      notice: null,
    })),
  stopAutoRotate: () => set({ autoRotate: false }),
  reset: () =>
    set((state) => ({
      ...initial,
      sceneRequest: state.sceneRequest + 1,
      cabinRequest: state.cabinRequest + 1,
    })),
}));
