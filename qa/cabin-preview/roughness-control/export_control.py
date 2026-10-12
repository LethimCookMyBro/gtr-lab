"""Private diagnostic: constant median roughness on six original red materials.

No image edits or app changes. The immutable source identity is part of the API.
Only the six allowed JSON field spans change; removed fields leave whitespace
so headers, offsets, padding, and the entire BIN chunk remain byte-identical.
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
ROUGHNESS = 0.6225882352941176


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
    json_bytes = raw[20:20 + json_size]
    document = json.loads(json_bytes)
    expected = copy.deepcopy(document)
    result = bytearray(raw)
    patches = []
    for index in TARGETS:
        material = document['materials'][index]
        pbr = material['pbrMetallicRoughness']
        if pbr['metallicFactor'] != 0 or pbr['roughnessFactor'] != .98 or pbr['metallicRoughnessTexture'] != {'index': 1, 'texCoord': 2} or material['normalTexture']['scale'] != .55:
            raise ValueError('Unexpected baseline material contract')
        old_material = compact(material)
        old_fields = b'"roughnessFactor":0.98,"metallicRoughnessTexture":{"index":1,"texCoord":2}'
        if json_bytes.count(old_material) != 1 or old_material.count(old_fields) != 1:
            raise ValueError('Expected unique original material byte span')
        start = 20 + json_bytes.index(old_material) + old_material.index(old_fields)
        changed = expected['materials'][index]['pbrMetallicRoughness']
        changed['roughnessFactor'] = ROUGHNESS
        del changed['metallicRoughnessTexture']
        replacement = compact({'roughnessFactor': ROUGHNESS})[1:-1]
        if len(replacement) > len(old_fields):
            raise ValueError('Replacement would move unrelated baseline bytes')
        replacement = replacement.ljust(len(old_fields), b' ')
        result[start:start + len(old_fields)] = replacement
        patches.append({'materialIndex': index, 'name': material['name'], 'path': f'materials/{index}/pbrMetallicRoughness', 'fileOffset': start, 'length': len(old_fields), 'before': old_fields.decode(), 'after': replacement.decode(), 'semanticChanges': {'roughnessFactor': {'before': .98, 'after': ROUGHNESS}, 'metallicRoughnessTexture': {'before': {'index': 1, 'texCoord': 2}, 'after': None}}})
    output = bytes(result)
    if json.loads(output[20:20 + json_size]) != expected:
        raise ValueError('Output semantic contract failed')
    wire = encode_gzip(output)
    baseline_wire = encode_gzip(raw)
    manifest = {'diagnosticOnly': True, 'source': {'sha256': sha(raw), 'bytes': len(raw), 'canonicalGzipBytes': len(baseline_wire), 'canonicalGzipSha256': sha(baseline_wire)}, 'output': {'sha256': sha(output), 'bytes': len(output), 'canonicalGzipBytes': len(wire), 'canonicalGzipSha256': sha(wire)}, 'gzip': {'python': platform.python_version(), 'zlib': zlib.ZLIB_VERSION, 'runtimeZlib': zlib.ZLIB_RUNTIME_VERSION, 'level': 9, 'mtime': 0}, 'constantEffectiveRoughness': ROUGHNESS, 'medianDerivation': 'original ORM green median 162 / 255 * 0.98', 'patches': patches, 'binSha256': sha(raw[28 + json_size:]), 'byteDiffCount': sum(a != b for a, b in zip(raw, output))}
    return output, manifest


def build(source, output):
    source, output = Path(source), Path(output)
    destinations = (output, Path(str(output) + '.gz'), output.parent / 'control-manifest.json')
    if any(source.resolve() == path.resolve() or (path.exists() and source.samefile(path)) for path in destinations):
        raise ValueError('Refusing to overwrite source')
    raw, manifest = transform(source.read_bytes())
    output.write_bytes(raw)
    Path(str(output) + '.gz').write_bytes(encode_gzip(raw))
    (output.parent / 'control-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'baseline.glb')
    parser.add_argument('--output', type=Path, default=ROOT / 'r35-contact-ao-static-faces-roughness-control.glb')
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output), indent=2))
