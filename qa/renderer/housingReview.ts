import {
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
} from "three";

/** Test-only experiment. Never imported by the production application. */
export function createHousingReview(scene: Object3D) {
  const entries: Array<{
    mesh: Mesh;
    baseline: MeshStandardMaterial;
    candidate: MeshStandardMaterial;
  }> = [];
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const namedHousing =
      object.userData.name === "Headlights.001_Glass_0" ||
      object.name === "Headlights001_Glass_0";
    const original = object.material;
    if (
      !namedHousing ||
      !(original instanceof MeshStandardMaterial) ||
      original.name !== "Glass"
    )
      return;
    const candidate = original.clone();
    candidate.name = "QA_ONLY_OPAQUE_HEADLAMP_HOUSING";
    candidate.color.setRGB(0.012, 0.015, 0.02);
    candidate.opacity = 1;
    candidate.transparent = false;
    candidate.depthWrite = true;
    candidate.alphaTest = 0;
    candidate.metalness = 0;
    candidate.roughness = 0.28;
    candidate.emissive.set(0);
    candidate.emissiveIntensity = 0;
    if (candidate instanceof MeshPhysicalMaterial) candidate.transmission = 0;
    entries.push({ mesh: object, baseline: original, candidate });
  });
  return {
    count: entries.length,
    setCandidate(active: boolean) {
      entries.forEach(({ mesh, baseline, candidate }) => {
        mesh.material = active ? candidate : baseline;
      });
    },
    dispose() {
      entries.forEach(({ mesh, baseline, candidate }) => {
        mesh.material = baseline;
        candidate.dispose();
      });
    },
  };
}
