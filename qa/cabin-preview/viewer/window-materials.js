import { MeshPhysicalMaterial, MeshStandardMaterial, Color, DoubleSide } from 'three';

export function createWindowMaterial(original) {
  const material = new MeshPhysicalMaterial();
  // Copy standard fields without reading undefined physical-only fields.
  if (original.isMeshStandardMaterial) MeshStandardMaterial.prototype.copy.call(material, original);
  // Standard.copy replaces defines; physical transmission needs both shader flags.
  material.defines = { ...material.defines, STANDARD: '', PHYSICAL: '' };
  material.name = `${original.name || 'Glass'}__R35_WINDOW_RUNTIME_OVERRIDE`;
  material.color = new Color(0xf0f8ff);
  material.map = null;
  material.alphaMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.emissive.set(0x000000);
  material.emissiveMap = null;
  material.aoMap = null;
  material.metalness = 0;
  material.roughness = 0.04;
  material.transmission = 1;
  material.ior = 1.52;
  material.thickness = 0.004;
  material.attenuationColor = new Color(0xd5e5ed);
  material.attenuationDistance = 3;
  // Physical transmission is separate from alpha blending.
  material.opacity = 1;
  material.transparent = false;
  material.alphaTest = 0;
  material.side = DoubleSide;
  material.depthWrite = true;
  material.needsUpdate = true;
  return material;
}
