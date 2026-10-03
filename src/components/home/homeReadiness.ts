/** Stages report observed work, never an invented overall percentage. */
export type HomeSceneLoadState =
  | {
      phase:
        "module" | "decoding" | "preparing" | "ready" | "deferred" | "skipped";
    }
  | { phase: "downloading"; loadedBytes: number; totalBytes?: number }
  | { phase: "error"; message: string; recovery: "retry" | "reload" };

export const SCENE_STAGE_TIMEOUT = 20_000;

export function sceneLoadLabel(state: HomeSceneLoadState) {
  switch (state.phase) {
    case "module":
      return "Starting the 3D viewer";
    case "downloading":
      return "Downloading the R35 model";
    case "decoding":
      return "Decoding geometry and textures";
    case "preparing":
      return "Preparing the 3D render";
    case "ready":
      return "3D view ready";
    case "deferred":
      return "3D is paused for Save-Data";
    case "skipped":
      return "Continuing without 3D";
    case "error":
      return state.message;
  }
}
export const formatModelBytes = (bytes: number) =>
  `${(bytes / 1_000_000).toFixed(1)} MB`;
