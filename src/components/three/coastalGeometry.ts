import { PlaneGeometry } from "three";

/** Metre-scaled road/retaining-wall alignment shared by land and water. */
export const coastBend = (z: number) =>
  Math.sign(z) *
  Math.min(80, Math.pow(Math.max(0, Math.abs(z) - 12), 2) * 0.003);

/** Local XY plane for the ocean at [-650,-1.8,0], rotated -PI/2 around X. */
export function createCoastalOceanGeometry() {
  const geometry = new PlaneGeometry(2000, 1400, 1, 280);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) > 0) {
      // Terminate inside the wall thickness. No water exists underneath the
      // scanned inland valleys, even when they dip below mean sea level.
      p.setX(i, 650 - 12.65 + coastBend(-p.getY(i)));
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
