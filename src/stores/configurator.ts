import { create } from "zustand";
import { getModel } from "../data/models";
import { paints, environments, cameraPresets } from "../data/configuration";
import type { EnvironmentId } from "../data/configuration";
export type Panel =
  "camera" | "environment" | "models" | "details" | "assets" | null;
interface ConfigState {
  selectedVariant: string;
  selectedPaint: string;
  selectedEnvironment: EnvironmentId;
  cameraPreset: string;
  cameraRequest: number;
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
  paintAvailable: false,
  lightsAvailable: false,
  notice: null as string | null,
  selectedVariant: "premium",
  selectedPaint: "silver",
  selectedEnvironment: "studio" as EnvironmentId,
  cameraPreset: "hero",
  cameraRequest: 0,
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
  selectVariant: (id) => {
    if (getModel(id))
      set({
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
      set({ selectedEnvironment: id, notice: null });
  },
  setCamera: (id) => {
    if (cameraPresets.some((c) => c.id === id))
      set((state) => ({
        cameraPreset: id,
        cameraRequest: state.cameraRequest + 1,
        autoRotate: false,
      }));
  },
  togglePanel: (panel) =>
    set((state) => ({ panel: state.panel === panel ? null : panel })),
  retryScene: () =>
    set({
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
