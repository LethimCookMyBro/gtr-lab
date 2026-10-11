import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

/**
 * Three's compileAsync owns an uncancellable timer which re-reads material
 * properties after disposal. Own this barrier instead: the scene can cancel it
 * before its vehicle, declarative studio and renderer release their resources.
 */
export function compileRearScene(
  renderer: WebGLRenderer,
  scene: Object3D,
  camera: Camera,
  signal: AbortSignal,
  targetScene?: Scene,
  programScope: "renderer" | "object" = "renderer",
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(new DOMException("Scene preparation cancelled", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    try {
      const materials = renderer.compile(scene, camera, targetScene);
      const context = renderer.getContext();
      const extension = context.getExtension("KHR_parallel_shader_compile");
      // Shared renderer readiness includes studio programs. Optional assets own
      // only the programs compiled for their materials: a concurrent cabin may
      // be cancelled and disposed while this separate proxy barrier is pending.
      // Snapshot handles now, never look up disposed material properties later.
      const programs =
        programScope === "object"
          ? [
              ...new Set(
                [...materials].map((material) => {
                  const properties = renderer.properties.get(material) as {
                    currentProgram?: NonNullable<
                      WebGLRenderer["info"]["programs"]
                    >[number];
                  };
                  const program = properties.currentProgram;
                  if (!program)
                    throw new Error("The 3D preparation program is missing.");
                  return program;
                }),
              ),
            ]
          : (renderer.info.programs ?? []);
      const pending = programs.map((owner) => ({
        owner,
        program: owner.program as WebGLProgram,
      }));
      const check = () => {
        if (settled) return;
        try {
          if (context.isContextLost())
            throw new Error("The 3D connection was interrupted.");
          for (let i = pending.length - 1; i >= 0; i--) {
            const { owner, program } = pending[i];
            // A separate React root can release resources before this effect's
            // cleanup. Never query a deleted handle or call that successful.
            if (
              !program ||
              owner.program !== program ||
              !renderer.info.programs?.includes(owner)
            )
              throw new Error(
                "The 3D preparation resources were released. Please retry.",
              );
            if (
              !extension ||
              context.getProgramParameter(
                program,
                extension.COMPLETION_STATUS_KHR,
              )
            ) {
              // Completion includes failed programs. Only a successful link can
              // release the preview's loading state into an interactive scene.
              if (!context.getProgramParameter(program, context.LINK_STATUS))
                throw new Error("The 3D shaders could not link. Please retry.");
              pending.splice(i, 1);
            }
          }
          if (pending.length === 0) finish();
          else timer = setTimeout(check, 10);
        } catch (error) {
          finish(error);
        }
      };
      check();
    } catch (error) {
      finish(error);
    }
  });
}
