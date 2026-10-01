import { BoxGeometry, OctahedronGeometry } from "three";
import type { BufferGeometry } from "three";

/** Synthetic test geometry only. Never imported by a production route or asset manifest. */
export const QA_MATERIAL_ROLES = {
  paint: ["QA_Paint"],
  headlights: ["QA_Lamp"],
  taillights: [],
};

export function createFixtureGlb(): ArrayBuffer {
  const body = new OctahedronGeometry(1)
    .scale(1.1, 0.7, 2)
    .translate(0, 0.7, 0);
  const lamp = new BoxGeometry(0.35, 0.35, 0.35)
    .translate(0, 0.7, 1.85)
    .toNonIndexed();
  const glass = new OctahedronGeometry(0.28).translate(0, 1.6, 0);
  const geometries: BufferGeometry[] = [body, lamp, glass];
  const binaryChunks: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const meshes: object[] = [];
  let binaryLength = 0;
  for (const [meshIndex, geometry] of geometries.entries()) {
    geometry.computeBoundingBox();
    const attributes: Record<string, number> = {};
    for (const [attributeName, semantic] of [
      ["position", "POSITION"],
      ["normal", "NORMAL"],
    ]) {
      const attribute = geometry.getAttribute(attributeName);
      const bytes = new Uint8Array(
        attribute.array.buffer,
        attribute.array.byteOffset,
        attribute.array.byteLength,
      ).slice();
      const accessor = accessors.length;
      attributes[semantic] = accessor;
      bufferViews.push({
        buffer: 0,
        byteOffset: binaryLength,
        byteLength: bytes.byteLength,
        target: 34962,
      });
      accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: 5126,
        count: attribute.count,
        type: "VEC3",
        ...(semantic === "POSITION"
          ? {
              min: geometry.boundingBox!.min.toArray(),
              max: geometry.boundingBox!.max.toArray(),
            }
          : {}),
      });
      binaryChunks.push(bytes);
      binaryLength += bytes.byteLength;
    }
    meshes.push({
      name: `QA_Synthetic_${meshIndex}`,
      primitives: [{ attributes, material: meshIndex }],
    });
    geometry.dispose();
  }
  const json = JSON.stringify({
    asset: {
      version: "2.0",
      generator: "GT-R LAB QA synthetic fixture; NOT A VEHICLE",
    },
    scene: 0,
    scenes: [{ name: "QA_ONLY_NOT_A_VEHICLE", nodes: [0, 1, 2] }],
    nodes: [{ mesh: 0 }, { mesh: 1 }, { mesh: 2 }],
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryLength }],
    materials: [
      {
        name: "QA_Paint",
        pbrMetallicRoughness: {
          baseColorFactor: [0.02, 0.2, 0.85, 1],
          metalnessFactor: 0.6,
          roughnessFactor: 0.25,
        },
      },
      {
        name: "QA_Lamp",
        emissiveFactor: [1, 1, 1],
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1] },
      },
      {
        name: "QA_ProtectedGlass",
        pbrMetallicRoughness: {
          baseColorFactor: [0.3, 0.5, 0.6, 0.65],
          roughnessFactor: 0.1,
        },
        alphaMode: "BLEND",
      },
    ],
  });
  const jsonBytes = new TextEncoder().encode(
    json.padEnd(Math.ceil(json.length / 4) * 4),
  );
  const output = new ArrayBuffer(
    12 + 8 + jsonBytes.byteLength + 8 + binaryLength,
  );
  const header = new DataView(output);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, output.byteLength, true);
  header.setUint32(12, jsonBytes.byteLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(output, 20, jsonBytes.byteLength).set(jsonBytes);
  const binOffset = 20 + jsonBytes.byteLength;
  header.setUint32(binOffset, binaryLength, true);
  header.setUint32(binOffset + 4, 0x004e4942, true);
  let writeOffset = binOffset + 8;
  for (const bytes of binaryChunks) {
    new Uint8Array(output, writeOffset, bytes.byteLength).set(bytes);
    writeOffset += bytes.byteLength;
  }
  return output;
}
