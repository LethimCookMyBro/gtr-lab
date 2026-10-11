import type { Texture } from "three";
import { WebGLTextures } from "three/src/renderers/webgl/WebGLTextures.js";
import { WebGLProperties } from "three/src/renderers/webgl/WebGLProperties.js";

/** Real Three allocation/disposal bookkeeping; only the native GL boundary is a test double. */
export function textureAllocation() {
  const properties = new WebGLProperties();
  const allocated: object[] = [],
    deleted: object[] = [];
  const gl = {
    TEXTURE_2D: 3553,
    TEXTURE_3D: 32879,
    TEXTURE_2D_ARRAY: 35866,
    TEXTURE0: 33984,
    RGBA: 6408,
    RGBA8: 32856,
    UNSIGNED_BYTE: 5121,
    createTexture() {
      const texture = { id: allocated.length + 1 };
      allocated.push(texture);
      return texture;
    },
    deleteTexture(texture: object) {
      deleted.push(texture);
    },
    pixelStorei() {},
    texParameteri() {},
  };
  const state = {
    bindTexture() {},
    activeTexture() {},
    texStorage2D() {},
    texSubImage2D() {},
  };
  const extensions = { has: () => false };
  const capabilities = { maxTextureSize: 4096 };
  const utils = { convert: (value: number) => value };
  const info = { memory: { textures: 0 }, render: { frame: 0 } };
  type Parameters = ConstructorParameters<typeof WebGLTextures>;
  const textures = new WebGLTextures(
    gl as unknown as Parameters[0],
    extensions as unknown as Parameters[1],
    state as unknown as Parameters[2],
    properties,
    capabilities as unknown as Parameters[4],
    utils as unknown as Parameters[5],
    info as unknown as Parameters[6],
  );
  const upload = (texture: Texture) => {
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    textures.setTexture2D(texture, 0);
  };
  return { properties, allocated, deleted, upload, info };
}
