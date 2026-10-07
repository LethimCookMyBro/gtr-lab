export const WINDOW_ALLOWLIST = Object.freeze([
  'Door Window_Glass_0', 'Doors.002_Glass_0',
  'Rear Window_Glass_0', 'Back Body.001_Glass_0',
]);

export function sourceName(object) {
  // glTF may put several primitive meshes beneath the named source node.
  for (let node = object; node; node = node.parent) {
    if (node.userData?.immutable_source_name) return node.userData.immutable_source_name;
    if (node.userData?.name) return node.userData.name;
  }
  return object.name || '';
}

export function classifyMesh(object, roles) {
  const name = sourceName(object);
  const windowRole = (roles.windowMeshes || []).find(role => role.name === name && role.confirmed === true);
  const isWindow = WINDOW_ALLOWLIST.includes(name) && Boolean(windowRole);
  const isCabin = (roles.cabinMeshNames || []).includes(name) ||
    (roles.cabinMeshPrefixes || []).some(prefix => prefix.length > 0 && name.startsWith(prefix));
  return { name, isWindow, isCabin, role: isWindow ? windowRole.role : isCabin ? 'cabin' : 'exterior' };
}

const finiteVector = vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
const interval = pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite) && pair[0] <= pair[1];
export function withinBounds(position, bounds) {
  return finiteVector(position) && finiteVector(bounds?.min) && finiteVector(bounds?.max) &&
    position.every((value, axis) => value >= bounds.min[axis] && value <= bounds.max[axis]);
}

export function validatePreset(preset, name) {
  const errors = [];
  if (!preset || !finiteVector(preset.position)) errors.push(`${name}: position must contain three finite coordinates`);
  if (!preset || !finiteVector(preset.target)) errors.push(`${name}: target must contain three finite coordinates`);
  if (errors.length) return errors;
  if (Math.hypot(...preset.target.map((value, axis) => value - preset.position[axis])) < 0.001) errors.push(`${name}: target must differ from eye position`);
  if (!Number.isFinite(preset.fov) || preset.fov < 25 || preset.fov > 110) errors.push(`${name}: fov must be between 25 and 110 degrees`);
  if (name === 'exterior') {
    const distance = Math.hypot(...preset.target.map((value, axis) => value - preset.position[axis]));
    if (!(preset.minDistance > 0 && preset.maxDistance >= preset.minDistance && distance >= preset.minDistance && distance <= preset.maxDistance)) {
      errors.push(`${name}: distance limits must contain the initial orbit radius`);
    }
  }
  if (name !== 'exterior') {
    if (!withinBounds(preset.position, preset.bounds)) errors.push(`${name}: position must lie inside explicit cabin bounds`);
    if (!interval(preset.yawBounds)) errors.push(`${name}: yawBounds must be an ordered finite pair`);
    if (!interval(preset.pitchBounds) || preset.pitchBounds[0] < -89 || preset.pitchBounds[1] > 89) errors.push(`${name}: pitchBounds must stay between -89 and 89 degrees`);
    if (!(preset.near > 0 && preset.near <= 0.05)) errors.push(`${name}: near must be positive and at most 0.05 metres`);
  }
  return errors;
}

const radians = degrees => degrees * Math.PI / 180;
const degrees = rad => rad * 180 / Math.PI;
const clamp = (value, range) => Math.max(range[0], Math.min(range[1], value));
export function cabinPose(preset, yawDelta, pitchDelta) {
  const [dx, dy, dz] = preset.target.map((value, axis) => value - preset.position[axis]);
  const baseYaw = Math.atan2(dx, dz);
  const basePitch = Math.atan2(dy, Math.hypot(dx, dz));
  const yaw = clamp(yawDelta, preset.yawBounds);
  const pitch = clamp(pitchDelta, preset.pitchBounds);
  // Relative pitch is also capped in world space so the up vector cannot flip.
  const pitchWorld = radians(clamp(degrees(basePitch) + pitch, [-89, 89]));
  const yawWorld = baseYaw + radians(yaw);
  return {
    position: [...preset.position], yaw, pitch,
    direction: [Math.sin(yawWorld) * Math.cos(pitchWorld), Math.sin(pitchWorld), Math.cos(yawWorld) * Math.cos(pitchWorld)],
  };
}

export function validateContract(contract) {
  if (contract?.schemaVersion !== 1 || contract.coordinateSystem !== 'three-y-up') return ['Unsupported camera contract version or coordinate system'];
  return ['exterior', 'driver', 'passenger', 'rear'].flatMap(name => validatePreset(contract.presets?.[name], name));
}

export function hasCurrentRender(state, minimumFrames = 1) {
  return state.ready === true && state.stats?.modelGeneration === state.loadGeneration &&
    state.stats?.renderedFrames >= minimumFrames;
}
