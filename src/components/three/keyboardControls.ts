import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

export function setViewerAccessibility(
  canvas: HTMLCanvasElement,
  interior: boolean,
) {
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-roledescription", "interactive 3D vehicle viewer");
  canvas.setAttribute(
    "aria-label",
    interior
      ? "Vehicle interior. Drag or use arrow keys to look around the fixed seat. Scroll to change field of view. Tab to leave the viewer."
      : "Interactive vehicle. Drag or use arrow keys to orbit. Scroll, pinch, or press plus and minus to zoom. Home resets the selected view. Tab to leave the viewer.",
  );
  canvas.setAttribute(
    "aria-keyshortcuts",
    interior
      ? "ArrowLeft ArrowRight ArrowUp ArrowDown"
      : "ArrowLeft ArrowRight ArrowUp ArrowDown + - Home",
  );
}

type Options = {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  onManual: () => void;
  onReset: () => void;
  invalidate: () => void;
};

/** Keyboard manipulates the same camera/target as pointer orbit, with identical limits. */
export function connectExteriorKeyboard({
  canvas,
  camera,
  controls,
  onManual,
  onReset,
  invalidate,
}: Options) {
  const offset = new Vector3();
  const spherical = new Spherical();
  function keydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "_",
        "Home",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    onManual();
    controls.autoRotate = false;
    if (event.key === "Home") {
      onReset();
      invalidate();
      return;
    }
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    const step = event.shiftKey ? 0.16 : 0.08;
    if (event.key === "ArrowLeft") spherical.theta -= step;
    if (event.key === "ArrowRight") spherical.theta += step;
    if (event.key === "ArrowUp") spherical.phi -= step;
    if (event.key === "ArrowDown") spherical.phi += step;
    if (event.key === "+" || event.key === "=") spherical.radius *= 0.9;
    if (event.key === "-" || event.key === "_") spherical.radius *= 1.1;
    spherical.radius = MathUtils.clamp(
      spherical.radius,
      controls.minDistance,
      controls.maxDistance,
    );
    spherical.phi = MathUtils.clamp(
      spherical.phi,
      controls.minPolarAngle,
      controls.maxPolarAngle,
    );
    spherical.makeSafe();
    camera.position.copy(
      offset.setFromSpherical(spherical).add(controls.target),
    );
    camera.lookAt(controls.target);
    controls.update();
    controls.enableDamping = damping;
    invalidate();
  }
  canvas.addEventListener("keydown", keydown);
  return () => canvas.removeEventListener("keydown", keydown);
}
