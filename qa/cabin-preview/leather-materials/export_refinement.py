"""Private, deterministic, six-scalar refinement of a hash-pinned original GLB.

The semantic JSON edit is used to discover and verify six one-byte patches.
The actual output is the original file with those six bytes substituted. No
geometry, image, binary payload, exporter metadata or formatting is changed.
"""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parent
BASE_SHA = '8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452'
TARGET_NAMES = {
    0: 'Red Amber | original constant-color approximation',
    10: 'Original approximate Red Amber door leather',
    13: 'Lower dashboard | Red Amber approximate',
    32: 'CTRL | Red Amber rim and selector leather approximate',
    34: 'REAR | approximate Red Amber leather',
    35: 'REAR | Red Amber sculpted center panels',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def serialized_json(document):
    data = json.dumps(document, separators=(',', ':')).encode()
    return data + b' ' * (-len(data) % 4)


def refine(data):
    if sha(data) != BASE_SHA:
        raise ValueError('Input is not the approved immutable baseline GLB')
    assert struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data))
    json_size, chunk_type = struct.unpack_from('<II', data, 12)
    assert chunk_type == 0x4e4f534a
    original_json_bytes = data[20:20 + json_size]
    document = json.loads(original_json_bytes)
    assert serialized_json(document) == original_json_bytes
    candidate = copy.deepcopy(document)
    patches = []
    for index, name in TARGET_NAMES.items():
        material = document['materials'][index]
        assert material['name'] == name
        assert material['normalTexture'] == {'index': 0, 'texCoord': 2, 'scale': 0.55}
        assert material['pbrMetallicRoughness']['roughnessFactor'] == 0.98
        individual = copy.deepcopy(document)
        individual['materials'][index]['normalTexture']['scale'] = 0.35
        individual_bytes = serialized_json(individual)
        offsets = [i for i, (a, b) in enumerate(zip(original_json_bytes, individual_bytes)) if a != b]
        assert len(individual_bytes) == json_size and len(offsets) == 1
        offset = 20 + offsets[0]
        assert data[offset - 2:offset + 2] == b'0.55'
        patches.append({
            'materialIndex': index, 'materialName': name,
            'jsonPath': f'/materials/{index}/normalTexture/scale',
            'from': 0.55, 'to': 0.35,
            'fileByteOffset': offset, 'beforeHex': '35', 'afterHex': '33',
            'scalarFileByteOffset': offset - 2,
            'scalarBeforeAscii': '0.55', 'scalarAfterAscii': '0.35',
        })
        candidate['materials'][index]['normalTexture']['scale'] = 0.35
    output = bytearray(data)
    for patch in patches:
        offset = patch['fileByteOffset']
        assert output[offset] == 0x35
        output[offset] = 0x33
    output = bytes(output)
    assert output[20:20 + json_size] == serialized_json(candidate)
    assert output[20 + json_size:] == data[20 + json_size:]
    assert sum(a != b for a, b in zip(data, output)) == 6
    return output, patches, json_size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'baseline.glb')
    parser.add_argument('--output', type=Path, default=ROOT / 'r35-contact-ao-static-faces-leather.glb')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'bytepatch-manifest.json')
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        raise ValueError('Refusing to overwrite the immutable input')
    data = args.source.read_bytes()
    if args.source.suffix == '.gz':
        data = gzip.decompress(data)
    output, patches, json_size = refine(data)
    compressed = gzip.compress(output, compresslevel=9, mtime=0)
    args.output.write_bytes(output)
    args.output.with_name(args.output.name + '.gz').write_bytes(compressed)
    baseline_gzip = gzip.compress(data, compresslevel=9, mtime=0)
    manifest = {
        'schemaVersion': 1,
        'scope': 'Private artistic scalar candidate. No new geometry, textures, images or render passes. Actual matched WebGL acceptance is pending.',
        'source': {'sha256': BASE_SHA, 'bytes': len(data), 'deterministicGzipBytes': len(baseline_gzip), 'deterministicGzipSha256': sha(baseline_gzip)},
        'candidate': {'file': args.output.name, 'sha256': sha(output), 'bytes': len(output), 'deterministicGzipBytes': len(compressed), 'deterministicGzipSha256': sha(compressed)},
        'changedFileBytes': 6,
        'rawJsonFormatPreserved': True,
        'allUndeclaredJsonFieldsExact': True,
        'binChunkBytes': len(data) - json_size - 28,
        'binChunkSha256': sha(data[json_size + 28:]),
        'binChunkExact': True,
        'roughnessFactorsExact': True,
        'canonicalGzipEncoder': {'implementation': 'Python gzip.compress', 'pythonVersion': sys.version.split()[0], 'zlibCompileVersion': zlib.ZLIB_VERSION, 'zlibRuntimeVersion': zlib.ZLIB_RUNTIME_VERSION, 'level': 9, 'mtime': 0},
        'patches': patches,
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
