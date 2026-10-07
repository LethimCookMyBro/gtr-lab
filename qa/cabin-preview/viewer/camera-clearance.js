import { Triangle, Vector3 } from 'three';

export function cameraNearRadius({ near, fov }, aspect) {
  const halfHeight = near * Math.tan(fov * Math.PI / 360);
  return Math.hypot(near, halfHeight, halfHeight * aspect);
}

// Exact loaded triangles, including nested and reflected world transforms.
// A clear eye-centred sphere enclosing the near rectangle covers every pan direction.
export function inspectEyeClearance(root, presets, aspect) {
  root.updateMatrixWorld(true);
  const results = Object.entries(presets).filter(([name]) => name !== 'exterior').map(([name, preset]) => ({
    name, eye: new Vector3().fromArray(preset.position), closest: Infinity, nearestComponent: null,
    nearRadius: cameraNearRadius(preset, aspect), trianglesChecked: 0,
  }));
  const triangle = new Triangle(), closest = new Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, positions = geometry.attributes.position, indices = geometry.index;
    const count = indices ? indices.count : positions.count;
    for (let offset = 0; offset < count; offset += 3) {
      triangle.a.fromBufferAttribute(positions, indices ? indices.getX(offset) : offset).applyMatrix4(mesh.matrixWorld);
      triangle.b.fromBufferAttribute(positions, indices ? indices.getX(offset + 1) : offset + 1).applyMatrix4(mesh.matrixWorld);
      triangle.c.fromBufferAttribute(positions, indices ? indices.getX(offset + 2) : offset + 2).applyMatrix4(mesh.matrixWorld);
      for (const result of results) {
        triangle.closestPointToPoint(result.eye, closest);
        const distance = result.eye.distanceTo(closest);
        if (distance < result.closest) { result.closest = distance; result.nearestComponent = mesh.userData.name || mesh.name; }
        result.trianglesChecked++;
      }
    }
  });
  return results.map(result => ({ camera: result.name, position: result.eye.toArray(), minimumTriangleDistanceM: result.closest,
    nearRectangleRadiusM: result.nearRadius, nearestComponent: result.nearestComponent, trianglesChecked: result.trianglesChecked,
    nearPlaneClearForAllPanDirections: result.closest > result.nearRadius + 0.001 }));
}
