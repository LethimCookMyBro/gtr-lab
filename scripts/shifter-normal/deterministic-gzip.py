"""Exact baseline-compatible CPU-only gzip encoder. stdin GLB -> stdout gzip."""
import gzip
import sys
import zlib

if zlib.ZLIB_RUNTIME_VERSION != "1.3.2":
    raise RuntimeError("This frozen exporter requires the baseline-compatible zlib 1.3.2")
sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(), compresslevel=9, mtime=0))
