import type { WebGLRenderer } from "three";

type Program = NonNullable<WebGLRenderer["info"]["programs"]>[number];
type Owner = { retiring: boolean; releases: Set<() => void> };
const owners = new WeakMap<WebGLRenderer, Owner>();
const protectedPrograms = new WeakSet<Program>();

/** Three 0.180.0 deletes shaders on first use, but destroy() only deletes the
 * program. Own compile-only cancellation too, without forcing shader linking.
 * Native shader identities/DELETE_STATUS prevent a repeated native delete.
 */
function protectProgram(renderer: WebGLRenderer, program: Program) {
  if (protectedPrograms.has(program)) return;
  protectedPrograms.add(program);
  const gl = renderer.getContext();
  const destroy = program.destroy.bind(program);
  let destroyed = false;
  program.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    const errors: unknown[] = [];
    if (!gl.isContextLost()) {
      for (const shader of new Set([
        program.vertexShader,
        program.fragmentShader,
      ])) {
        try {
          if (
            gl.isShader(shader) &&
            gl.getShaderParameter(shader, gl.DELETE_STATUS) === false
          )
            gl.deleteShader(shader);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    try {
      destroy();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, "Renderer program release failed.");
  };
}

function ownerFor(renderer: WebGLRenderer) {
  const existing = owners.get(renderer);
  if (existing) return existing;
  const owner: Owner = { retiring: false, releases: new Set() };
  owners.set(renderer, owner);
  // Three's compileAsync also calls this.compile. A finally pass protects a
  // partially compiled batch before its caller can dispose any material.
  const compile = renderer.compile;
  if (typeof compile === "function") {
    renderer.compile = function (...args) {
      if (owner.retiring) throw new Error("The renderer is retired.");
      try {
        return compile.apply(this, args);
      } finally {
        for (const program of renderer.info.programs ?? [])
          protectProgram(renderer, program);
      }
    };
  }
  return owner;
}

export function prepareRendererResourceOwnership(renderer: WebGLRenderer) {
  ownerFor(renderer);
}

/** Idempotent per effect generation, not per Three object: StrictMode may
 * release and subsequently re-upload the same helper geometry/material.
 */
export function registerRendererResourceOwner(
  renderer: WebGLRenderer,
  release: () => void,
) {
  const owner = ownerFor(renderer);
  if (owner.retiring) {
    // The caller supplies only its newly owned resources. Refuse registration
    // but do not strand allocations created before the rejected effect setup.
    try {
      release();
    } catch (error) {
      throw new AggregateError(
        [error],
        "Cannot register resources on a retired renderer; cleanup failed.",
      );
    }
    throw new Error("Cannot register resources on a retired renderer.");
  }
  let released = false;
  const retire = () => {
    if (released) return;
    released = true;
    owner.releases.delete(retire);
    release();
  };
  owner.releases.add(retire);
  return retire;
}

export function releaseRendererResourceOwners(renderer: WebGLRenderer) {
  const owner = ownerFor(renderer);
  owner.retiring = true;
  const errors: unknown[] = [];
  // Catch render-only internal programs too, before normal material cleanup.
  for (const program of renderer.info?.programs ?? [])
    protectProgram(renderer, program);
  for (const release of [...owner.releases]) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Renderer resource release failed.");
}

/** Three 0.180.0 WebGLPrograms.dispose only clears the shader cache. Call AFTER
 * normal renderer.dispose clears material properties, BEFORE the final fence.
 * Native program handles belong to this renderer, even when materials share
 * them. Never dispose arbitrary shared scene materials/geometry here.
 */
export function releaseRemainingRendererPrograms(renderer: WebGLRenderer) {
  const programs = renderer.info?.programs;
  if (!programs) return;
  const errors: unknown[] = [];
  for (const program of [...new Set(programs)]) {
    try {
      protectProgram(renderer, program);
      if (program.program !== undefined) program.destroy();
    } catch (error) {
      errors.push(error);
    }
  }
  programs.length = 0;
  if (errors.length)
    throw new AggregateError(errors, "Renderer cache release failed.");
}

/** Only pass resources constructed by the calling helper, never cache borrowers. */
export function disposeOwnedResources(
  resources: Iterable<{ dispose: () => void }>,
) {
  const errors: unknown[] = [];
  for (const resource of new Set(resources)) {
    try {
      resource.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Owned helper release failed.");
}
