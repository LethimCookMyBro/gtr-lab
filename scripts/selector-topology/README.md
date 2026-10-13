# Selector support authoring source

Place these files under `scripts/selector-topology/` in the app repository. Python is only for optional source rebuild/audit. The runtime and CI Node verifier do not require Python.

From the repository root, rebuild to a new or empty explicit directory:

    python scripts/selector-topology/build_selector.py --out-dir /tmp/selector-rebuild

The accepted baseline defaults to `qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz`, resolved relative to the repository rather than the working directory. Override it with `--baseline PATH` when needed. The builder rejects a missing output path, source/baseline directories, or a nonempty output directory. It never overwrites existing files.

Verify a rebuilt result and its own barycentric proof:

    python scripts/selector-topology/verify_selector.py --candidate /tmp/selector-rebuild/candidate.glb.gz --provenance /tmp/selector-rebuild/provenance.json

Run the portable two-build/safe-output contract:

    python scripts/selector-topology/test_portable_authoring.py --baseline qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz

Dependencies: Python 3.12, NumPy 2.3.5; exact gzip proof uses zlib 1.3.2. Two independent output directories produced byte-identical raw, gzip and provenance files.

Raw candidate SHA256: `699bea11244bcb695fee412bb4668d074c0330550c62385e235b417e78dba7b2`.
Gzip SHA256: `eff3624270a69066857be4c25b8ddd1e352cc5fc78b3041679f858e1323657be`.
Provenance SHA256: `45a317ca3c932cc1c1c3f40635eefaf3b7b5f0d6414e3b7071336a57db9fb42b`.

This is accepted-surface subdivision with source-derived shading support, not restoration of the original quadratic cap geometry. The source equations were transcript-reconstructed, not a historical master or factory CAD. Production visual acceptance remains separate.
