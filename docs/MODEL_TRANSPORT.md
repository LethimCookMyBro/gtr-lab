# Licensed GLB transport and offline reconstruction

The licensed Ciasny R35 is transported as small, checksum-pinned binary files in
`modeldata/`, outside Vite's `public/` directory. A build reconstructs
`public/models/ciasny-r35.glb` locally before Vite copies public assets into
`dist/`. Neither reconstruction nor runtime model loading needs an external
model host, credentials, expiring download URLs, or Git LFS.

The reconstruction implementation and tests do not contain model geometry. The
test suite generates a tiny synthetic GLB in temporary directories. Add the
authorized, reviewed, optimized production asset separately; an absent manifest
or incomplete chunks causes the command to fail rather than publish a fallback.

## Repository layout

```text
modeldata/
  manifest.json
  ciasny-r35/
    0000.bin
    0001.bin
    ...
scripts/prepare-models.mjs
public/models/ciasny-r35.glb   # generated; do not track this assembled file
```

Chunks contain unencoded binary bytes. The maximum chunk size is 262,144 bytes
(256 KiB); the final chunk can be shorter. The manifest is an array with this
shape. The numbers and hashes below are placeholders, not production values:

```json
[
  {
    "id": "ciasny-r35",
    "path": "/models/ciasny-r35.glb",
    "bytes": 300000,
    "sha256": "<64 lowercase hexadecimal characters for the assembled GLB>",
    "source": {
      "title": "Nissan GTR R35",
      "author": "Ciasny",
      "url": "https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a"
    },
    "license": {
      "name": "CC BY 4.0",
      "url": "https://creativecommons.org/licenses/by/4.0/"
    },
    "chunks": [
      {
        "path": "ciasny-r35/0000.bin",
        "bytes": 262144,
        "sha256": "<64 lowercase hexadecimal characters for chunk 0000>"
      },
      {
        "path": "ciasny-r35/0001.bin",
        "bytes": 37856,
        "sha256": "<64 lowercase hexadecimal characters for chunk 0001>"
      }
    ]
  }
]
```

Each chunk path is relative to `modeldata/` and must exactly match
`<id>/<zero-based index padded to four digits>.bin` in array order. The public
path must exactly match `/models/<id>.glb`. The maximum assembled size is 64 MiB.
Source and license URLs must be canonical HTTPS URLs without embedded login
credentials. They are retained as metadata and are never fetched by this script.

Additional metadata is allowed, for example the original archive hash, download
date, optimization settings, and an accurate list of modifications. Preserve
supplied license/copyright notices and provide creator/source/license links and
the actual modifications in the app's credits. Manifest metadata alone does not
establish redistribution rights or replace the public attribution requirements.

## Preparing a reviewed asset for transport

1. Start with the authorized optimized Ciasny GLB and its verified source/license
   record. Finish visual and runtime review before choosing the production bytes.
2. Split its bytes in order into files no larger than 262,144 bytes. Do not encode,
   compress, or transform chunks independently; concatenating them must reproduce
   the optimized GLB byte for byte.
3. Compute each chunk's exact size and SHA-256, the complete GLB's exact size and
   SHA-256, and write `modeldata/manifest.json` using the schema above. Hashes must
   be calculated from these reviewed bytes, not copied from an unrelated file.
4. Commit the manifest, all referenced chunks, and retained notices together. The
   build must have the complete chunk set. Keep the assembled GLB untracked.
5. Run `node scripts/prepare-models.mjs`. Check that the final SHA-256 agrees with
   the optimized input, then run the application tests and Vite build.

There is intentionally no network fetch, automatic hash repair, partial-chunk
fallback, or credential handling in reconstruction. Missing/corrupt transport
files must be restored from the reviewed asset or the matching repository commit.

## Required build hooks

Add this command to the existing asset preparation chain before TypeScript/Vite:

```json
{
  "scripts": {
    "prepare:assets": "node scripts/prepare-models.mjs && node scripts/fetch-environments.mjs",
    "build": "npm run prepare:assets && tsc -b && vite build"
  }
}
```

Add `public/models/ciasny-r35.glb` to `.gitignore`; do not ignore `modeldata/`.
Existing CI/deployment that runs `npm run build` needs no second reconstruction
command. Any separate CI or preview job invoking `vite build` directly must run
asset preparation first. For development, run preparation before starting Vite
on a clean checkout. Run `npm test` for the complete project suite; the dedicated
tests are in `tests/prepare-models.test.mjs`.

The default manifest and output roots are relative to the script's location, so
the CLI behaves the same when launched from another working directory. The
exported `prepareModels(manifest, { directory, publicDirectory, log })` also
supports isolated tooling/tests; input and public roots must not overlap.

## Validation and publication guarantees

- Validate the entire manifest before creating outputs. Reject duplicate model
  destinations, unsafe paths, missing provenance/license fields, invalid hashes,
  invalid sizes, wrong chunk order, and inconsistent total sizes
- Reject observed symbolic links and non-directory parents, and require regular
  input/output files. On platforms supporting it, open inputs with `O_NOFOLLOW`;
  bound file reads so unexpected growth cannot create an unbounded allocation
- Reuse an existing output only after verifying its exact byte count, SHA-256,
  GLB magic/version/declared length, aligned chunk boundaries, and initial JSON
  chunk. A verified cached output is left untouched and does not require reading
  transport chunks again
- If reconstruction is needed, require every chunk, verify every chunk's size
  and SHA-256, then verify the combined GLB before writing anything to its target
- Write a unique, exclusive temporary file beside the destination, and publish
  it with a same-directory atomic rename. Readers holding the old inode retain
  it; failed verification preserves the old output. Remove the temporary file
  after publication or failure
- Exit nonzero on preparation failure so Vite never publishes an unchecked model

These are build integrity checks for a trusted checkout, not full glTF semantic,
visual, licensing, or security certification. The checkout should not be
modified concurrently by an untrusted process; filesystem path checks are not a
sandbox against adversarial ancestor-directory replacement. Re-run visual and
runtime QA after changing the optimized asset.
