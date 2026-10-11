/** The structural subset used by this adapter; installed OrbitControls types update as void. */
export interface OrbitLike {
  enabled: boolean;
  enableDamping: boolean;
  autoRotate: boolean;
  dampingFactor: number;
  update: () => unknown;
}

export interface ReleasedOrbitEligibility {
  exterior: boolean;
  moving: boolean;
  reducedMotion: boolean;
}

export interface ReleasedOrbitDamping {
  /** Call only for an accepted exterior gesture; IDs include all held touches. */
  pointerDown(pointerId: number, nowSeconds: number): void;
  /** Only a final, previously accepted pointer release can start an epoch. */
  pointerUp(pointerId: number, nowSeconds: number): void;
  /** Wheel, keyboard, or other native input: cancel the epoch but retain held IDs. */
  inputBoundary(nowSeconds: number): void;
  /** Mode, cancellation, blur, or lifecycle boundary: discard held IDs too. */
  reset(): void;
  /** Arm immediately before the sole Drei update owner, using one monotonic clock. */
  arm(nowSeconds: number, eligibility: ReleasedOrbitEligibility): void;
  /** Clear after Drei; neither arm nor clear performs an update or invalidation. */
  clear(): void;
  dispose(): void;
}

const BASELINE_DAMPING = 0.09;
const REFERENCE_HZ = 60;
const LOG_RETAINED = Math.log1p(-BASELINE_DAMPING);

/**
 * Compensates only slow frames during an actually released exterior gesture.
 *
 * Integration must preserve synchronous ordering: existing camera work, arm,
 * Drei's existing update, clear. An intervening update caller can steal a token;
 * this wrapper cannot identify its caller. Never add an update owner for it.
 */
export function createReleasedOrbitDamping(
  controls: OrbitLike,
): ReleasedOrbitDamping {
  const originalUpdate = controls.update;
  const pointers = new Set<number>();
  let disposed = false;
  let released = false;
  let generation = 0;
  let cursor: number | null = null;
  let lastObserved: number | null = null;
  let lastArmed: number | null = null;
  let token: { factor: number; at: number; generation: number } | null = null;

  const cancelRelease = () => {
    released = false;
    token = null;
    cursor = null;
    generation += 1;
  };

  const observeTime = (now: number): boolean => {
    if (
      !Number.isFinite(now) ||
      now < 0 ||
      (lastObserved !== null && now < lastObserved)
    ) {
      cancelRelease();
      // A later genuine gesture can establish a fresh clock after a reset.
      lastObserved = Number.isFinite(now) && now >= 0 ? now : null;
      lastArmed = null;
      return false;
    }
    lastObserved = now;
    return true;
  };

  const controlsEligible = () =>
    controls.enabled && controls.enableDamping && !controls.autoRotate;

  const wrappedUpdate = (): unknown => {
    // A newer wrapper may retain this function after cleanup. Become transparent.
    if (disposed) return originalUpdate.call(controls);
    const consumed = token;
    token = null; // Consume before originalUpdate can synchronously reenter.
    const eligible =
      consumed !== null &&
      consumed.generation === generation &&
      released &&
      pointers.size === 0 &&
      controlsEligible();
    const previousFactor = controls.dampingFactor;
    if (eligible) cursor = consumed.at;
    else cancelRelease();
    try {
      // Untokened and reentrant calls must never inherit an outer frame's factor.
      controls.dampingFactor = eligible ? consumed.factor : BASELINE_DAMPING;
      const changed = originalUpdate.call(controls);
      if (eligible && changed === false && consumed.generation === generation)
        cancelRelease();
      return changed;
    } catch (error) {
      cancelRelease();
      throw error;
    } finally {
      controls.dampingFactor = previousFactor;
    }
  };
  controls.update = wrappedUpdate;

  return {
    pointerDown(pointerId, nowSeconds) {
      if (disposed) return;
      cancelRelease();
      observeTime(nowSeconds);
      pointers.add(pointerId);
    },
    pointerUp(pointerId, nowSeconds) {
      if (disposed || !pointers.delete(pointerId)) return;
      cancelRelease();
      if (observeTime(nowSeconds) && pointers.size === 0) {
        released = true;
        cursor = nowSeconds;
      }
    },
    inputBoundary(nowSeconds) {
      if (disposed) return;
      cancelRelease();
      observeTime(nowSeconds);
    },
    reset() {
      if (disposed) return;
      cancelRelease();
      pointers.clear();
      lastObserved = null;
      lastArmed = null;
    },
    arm(nowSeconds, eligibility) {
      if (disposed) return;
      token = null;
      if (!observeTime(nowSeconds)) return;
      if (lastArmed !== null && nowSeconds <= lastArmed) {
        cancelRelease();
        return;
      }
      lastArmed = nowSeconds;
      if (
        !eligibility.exterior ||
        eligibility.moving ||
        eligibility.reducedMotion ||
        !controlsEligible()
      ) {
        cancelRelease();
        pointers.clear();
        return;
      }
      if (!released || pointers.size !== 0 || cursor === null) return;
      const elapsed = nowSeconds - cursor;
      token = {
        factor: Math.max(
          BASELINE_DAMPING,
          -Math.expm1(REFERENCE_HZ * elapsed * LOG_RETAINED),
        ),
        at: nowSeconds,
        generation,
      };
    },
    clear() {
      token = null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelRelease();
      pointers.clear();
      if (controls.update === wrappedUpdate) controls.update = originalUpdate;
    },
  };
}
