"""Private, original-map red leather 4x ORM tiling candidate; no image edits.

Inserts only six textureInfo transforms and one extensionsUsed registration.
Original JSON bytes keep their order; only GLB length fields/padding are rebuilt.
The BIN chunk, including its header and every embedded image, stays exact.
"""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import platform
import struct
import zlib

ROOT = Path(__file__).resolve().parent
BASELINE_SHA = '8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452'
TARGETS = (0, 10, 13, 32, 34, 35)
EXTENSION = 'KHR_texture_transform'
ADDITION = b',"extensions":{"KHR_texture_transform":{"scale":[4,4]}}'
REGISTRATION = b',"KHR_texture_transform"'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(value):
    return json.dumps(value, separators=(',', ':')).encode()


def encode_gzip(data):
    return gzip.compress(data, compresslevel=9, mtime=0)


def transform(source):
    raw = gzip.decompress(source) if source.startswith(b'\x1f\x8b') else source
    if sha(raw) != BASELINE_SHA:
        raise ValueError('Expected immutable original baseline 8645956f; refusing changed or previously refined input')
    json_size = struct.unpack_from('<I', raw, 12)[0]
    original_json = raw[20:20 + json_size]
    document = json.loads(original_json)
    expected = copy.deepcopy(document)
    material_insertions = []
    insertions = []
    for index in TARGETS:
        material = document['materials'][index]
        pbr = material['pbrMetallicRoughness']
        if pbr['metallicFactor'] != 0 or pbr['roughnessFactor'] != .98 or pbr['metallicRoughnessTexture'] != {'index': 1, 'texCoord': 2} or material['normalTexture']['scale'] != .55:
            raise ValueError('Unexpected baseline material contract')
        old_material = compact(material)
        field = b'"metallicRoughnessTexture":{"index":1,"texCoord":2}'
        if original_json.count(old_material) != 1 or old_material.count(field) != 1:
            raise ValueError('Expected unique original textureInfo span')
        offset = original_json.index(old_material) + old_material.index(field) + len(field) - 1
        insertions.append((offset, ADDITION))
        material_insertions.append({'materialIndex': index, 'name': material['name'], 'path': f'materials/{index}/pbrMetallicRoughness/metallicRoughnessTexture/extensions', 'originalJsonOffset': offset, 'insertedBytes': len(ADDITION), 'insertedText': ADDITION.decode()})
        expected['materials'][index]['pbrMetallicRoughness']['metallicRoughnessTexture']['extensions'] = {EXTENSION: {'scale': [4, 4]}}
    if EXTENSION in document['extensionsUsed']:
        raise ValueError('Unexpected baseline extension registration')
    original_extensions = b'"extensionsUsed":' + compact(document['extensionsUsed'])
    if original_json.count(original_extensions) != 1:
        raise ValueError('Expected unique original extensionsUsed array')
    extension_offset = original_json.index(original_extensions) + len(original_extensions) - 1
    insertions.append((extension_offset, REGISTRATION))
    expected['extensionsUsed'].append(EXTENSION)
    changed_json = original_json.rstrip(b' ')
    for offset, data in sorted(insertions, reverse=True):
        changed_json = changed_json[:offset] + data + changed_json[offset:]
    changed_json += b' ' * (-len(changed_json) % 4)
    if json.loads(changed_json) != expected:
        raise ValueError('Output semantic contract failed')
    binary_chunk = raw[20 + json_size:]
    total = 20 + len(changed_json) + len(binary_chunk)
    output = raw[:8] + struct.pack('<III', total, len(changed_json), 0x4e4f534a) + changed_json + binary_chunk
    wire, baseline_wire = encode_gzip(output), encode_gzip(raw)
    manifest = {'privateCandidate': True, 'source': {'sha256': sha(raw), 'bytes': len(raw), 'canonicalGzipBytes': len(baseline_wire), 'canonicalGzipSha256': sha(baseline_wire)}, 'output': {'sha256': sha(output), 'bytes': len(output), 'canonicalGzipBytes': len(wire), 'canonicalGzipSha256': sha(wire)}, 'gzip': {'python': platform.python_version(), 'zlib': zlib.ZLIB_VERSION, 'runtimeZlib': zlib.ZLIB_RUNTIME_VERSION, 'level': 9, 'mtime': 0}, 'treatment': {'textureScale': [4, 4], 'physicalRepeatMetres': .016, 'originalRepeatMetres': .064, 'originalRoughnessFactor': .98, 'originalNormalScale': .55}, 'materialInsertions': material_insertions, 'extensionRegistration': {'originalJsonOffset': extension_offset, 'insertedText': REGISTRATION.decode()}, 'jsonChunkBytes': {'before': json_size, 'after': len(changed_json)}, 'binSha256': sha(binary_chunk[8:]), 'allOriginalJsonBytesPreservedInOrderExceptAlignmentPadding': True, 'binChunkIncludingHeaderExact': True}
    return output, manifest


def build(source, output):
    source, output = Path(source), Path(output)
    destinations = (output, Path(str(output) + '.gz'), output.parent / 'uv-scale-manifest.json')
    if any(source.resolve() == path.resolve() or (path.exists() and source.samefile(path)) for path in destinations):
        raise ValueError('Refusing to overwrite source')
    raw, manifest = transform(source.read_bytes())
    output.write_bytes(raw)
    Path(str(output) + '.gz').write_bytes(encode_gzip(raw))
    (output.parent / 'uv-scale-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'baseline.glb')
    parser.add_argument('--output', type=Path, default=ROOT / 'r35-contact-ao-static-faces-roughness-uv4.glb')
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output), indent=2))
