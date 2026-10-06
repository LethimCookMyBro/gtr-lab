#!/usr/bin/env python3
"""Recover only the two pinned failed entry traces. Never run downloaded content."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import urllib.request
import zipfile

REPOSITORY = 'LethimCookMyBro/gtr-lab'
RUN_ID = 37493234609
ATTEMPT = 2
HEAD_SHA = '7c29d06dac13519de2d2d89f45ab299542f99c4e'
ARTIFACT_ID = 11428405876
ARTIFACT_NAME = 'story-exhibition-evidence'
ARTIFACT_BYTES = 81414312
ARTIFACT_SHA = 'e665509cd8da30161c23c3db3e47a8039eee2f2c3829858f6b1516de3fb26a11'
# Leave 2 MiB for the outer artifact archive and metadata below the 32 MiB tool cap.
MAX_CASE_BYTES = 30 * 1024 * 1024
CASES = {name: 'test-results/centered-exhibition/centered-exhibition-previe-68d09-e-forward-and-reverse-input-' + name for name in ('exhibition-wide-1920', 'exhibition-mobile-390')}
REQUIRED = {'error-context.md', 'trace.zip'}

def require(condition, message):
    if not condition: raise ValueError(message)

def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): digest.update(chunk)
    return digest.hexdigest()

def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def validate_provenance(run, artifact):
    require(run.get('id') == RUN_ID, 'Wrong source run')
    require(run.get('run_attempt') == ATTEMPT, 'Wrong source attempt')
    require(run.get('head_sha') == HEAD_SHA, 'Wrong source head SHA')
    require(run.get('repository', {}).get('full_name') == REPOSITORY, 'Wrong source repository')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'failure', 'Source attempt is not a completed failure')
    require(artifact.get('id') == ARTIFACT_ID and artifact.get('name') == ARTIFACT_NAME, 'Wrong source artifact')
    require(artifact.get('size_in_bytes') == ARTIFACT_BYTES, 'Wrong source artifact size')
    require(artifact.get('digest') == 'sha256:' + ARTIFACT_SHA, 'Wrong source artifact digest')
    require(artifact.get('expired') is False, 'Source artifact is expired or expiry unknown')
    linked = artifact.get('workflow_run', {})
    require(linked.get('id') == RUN_ID and linked.get('head_sha') == HEAD_SHA, 'Artifact does not belong to the pinned source run/head')
    created = timestamp(artifact['created_at'])
    require(timestamp(run['run_started_at']) <= created <= timestamp(run['updated_at']), 'Artifact was not created during the pinned attempt')

def api_json(path):
    token = os.environ['GH_TOKEN']
    request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + path, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)

def verify_source(destination):
    require(os.environ.get('GITHUB_REPOSITORY') == REPOSITORY, 'Only the intended repository may run this diagnostic')
    run = api_json(f'/actions/runs/{RUN_ID}/attempts/{ATTEMPT}')
    artifact = api_json(f'/actions/artifacts/{ARTIFACT_ID}')
    validate_provenance(run, artifact)
    # Retain selected public metadata, never a token, request header or signed URL.
    record = {'repository':REPOSITORY, 'run_id':RUN_ID, 'attempt':ATTEMPT, 'head_sha':HEAD_SHA, 'artifact_id':ARTIFACT_ID, 'artifact_name':ARTIFACT_NAME, 'artifact_bytes':ARTIFACT_BYTES, 'artifact_sha256':ARTIFACT_SHA, 'artifact_created_at':artifact['created_at'], 'run_started_at':run['run_started_at'], 'run_updated_at':run['updated_at']}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))

def extract_cases(archive, output, max_bytes=MAX_CASE_BYTES):
    require(not output.exists(), 'Evidence output already exists; refusing to mix runs')
    plans = []
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        for case, prefix in CASES.items():
            selected = [entry for entry in entries if entry.filename.startswith(prefix + '/') and '/' not in entry.filename[len(prefix)+1:] and (Path(entry.filename).name in REQUIRED or Path(entry.filename).name.endswith('.png'))]
            names = [Path(entry.filename).name for entry in selected]
            require(len(names) == len(set(names)), f'Duplicate evidence for {case}')
            require(REQUIRED.issubset(names), f'Missing required trace/context for {case}')
            for entry in selected:
                require(not entry.is_dir() and not stat.S_ISLNK(entry.external_attr >> 16), f'Unexpected non-file evidence: {entry.filename}')
                require(entry.file_size <= max_bytes, f'Individual file exceeds evidence limit: {entry.filename} ({entry.file_size} bytes)')
            total = sum(entry.file_size for entry in selected)
            require(total + 64 * 1024 <= max_bytes, f'{case} exceeds {max_bytes} byte bundle limit ({total} payload bytes); retain original and report, never truncate')
            plans.append((case, selected, total))
        report = {'source_run':RUN_ID, 'source_attempt':ATTEMPT, 'source_head_sha':HEAD_SHA, 'source_artifact_id':ARTIFACT_ID, 'source_archive_sha256':ARTIFACT_SHA, 'cases':[]}
        for case, selected, total in plans:
            folder = output / case
            folder.mkdir(parents=True)
            files = []
            for entry in selected:
                target = folder / Path(entry.filename).name
                with source.open(entry) as reader, target.open('xb') as writer: shutil.copyfileobj(reader, writer, 1024 * 1024)
                require(target.stat().st_size == entry.file_size, f'Extracted size mismatch: {entry.filename}')
                files.append({'name':target.name, 'source_path':entry.filename, 'bytes':entry.file_size, 'sha256':sha256(target)})
            case_record = {'name':case, 'payload_bytes':total, 'missing_optional_png':not any(item['name'].endswith('.png') for item in files), 'files':files}
            (folder / 'manifest.json').write_text(json.dumps({**report, 'cases':[case_record]}, indent=2) + '\n')
            require(sum(p.stat().st_size for p in folder.iterdir()) < max_bytes, f'{case} exceeds final bundle limit')
            report['cases'].append(case_record)
        (output / 'extraction-summary.json').write_text(json.dumps(report, indent=2) + '\n')
        return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['verify', 'extract'])
    parser.add_argument('--incoming', type=Path, default=Path('entry-source'))
    parser.add_argument('--output', type=Path, default=Path('entry-evidence'))
    parser.add_argument('--provenance', type=Path, default=Path('entry-provenance/source.json'))
    args = parser.parse_args()
    if args.mode == 'verify':
        verify_source(args.provenance)
        return
    record = json.loads(args.provenance.read_text())
    require(record['head_sha'] == HEAD_SHA and record['artifact_id'] == ARTIFACT_ID and record['artifact_sha256'] == ARTIFACT_SHA, 'Invalid saved provenance')
    files = [p for p in args.incoming.rglob('*') if p.is_file()]
    require(len(files) == 1 and not files[0].is_symlink(), 'Expected exactly one unextracted source artifact file')
    archive = files[0]
    require(archive.stat().st_size == ARTIFACT_BYTES, 'Downloaded archive size mismatch')
    require(sha256(archive) == ARTIFACT_SHA, 'Downloaded archive SHA-256 mismatch')
    print(json.dumps(extract_cases(archive, args.output), indent=2))

if __name__ == '__main__': main()
