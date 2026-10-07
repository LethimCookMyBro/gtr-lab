import { describe, expect, it } from 'vitest';
import { isExpectedCabinRequestFailure } from '../scripts/capture-cabin-preview.mjs';

const path = '/models/r35-cabin-sealed-spatial.glb';
const phase = 'Missing cabin preserves exterior and Retry loads real asset';
const missing = { requestId: 3, path, status: 404, injectedFault: 'missing' };
const retry = { requestId: 4, path, status: 200 };
const aborted = { requestId: 3, path, phase, failure: 'net::ERR_ABORTED' };

describe('cabin integration network fault classification', () => {
  it('allows the exact injected 404 response aborted by optional-loader cleanup', () => {
    expect(isExpectedCabinRequestFailure(aborted, [missing, retry])).toBe(true);
  });

  it('correlates a late 404 cleanup event even after the phase changes', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, phase: 'Three production seat views and keyboard/touch look' }, [missing, retry])).toBe(true);
  });

  it('does not excuse the successful retry request in the same phase', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, requestId: 4 }, [missing, retry])).toBe(false);
  });

  it.each([
    ['unmarked 404', { ...missing, injectedFault: undefined }],
    ['different request', { ...missing, requestId: 8 }],
    ['wrong status', { ...missing, status: 500 }],
    ['different asset', { ...missing, path: '/models/ciasny-r35.glb' }],
  ])('rejects an abort associated with %s', (_label, response) => {
    expect(isExpectedCabinRequestFailure(aborted, [response])).toBe(false);
  });

  it.each([
    ['a non-abort network error', { ...aborted, failure: 'net::ERR_CONNECTION_RESET' }],
    ['another asset', { ...aborted, path: '/models/ciasny-r35.glb' }],
    ['a missing request ID', { ...aborted, requestId: undefined }],
  ])('does not excuse %s', (_label, failure) => {
    expect(isExpectedCabinRequestFailure(failure, [missing])).toBe(false);
  });

  it('requires a known response even when both records lack an ID', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, requestId: undefined }, [{ ...missing, requestId: undefined }])).toBe(false);
  });

  it('retains the intentional held-stream cancel and in-flight switch cases', () => {
    for (const phase of ['Delayed download cancel and stale response ignored', 'In-flight cabin switch tears down and all other five stay photographic']) {
      expect(isExpectedCabinRequestFailure({ ...aborted, phase }, [{ ...missing, status: 200, injectedFault: 'held-stream' }])).toBe(true);
    }
  });

  it('does not excuse an ordinary request in a cancellation phase', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, phase: 'Delayed download cancel and stale response ignored' }, [{ ...missing, status: 200, injectedFault: undefined }])).toBe(false);
  });
});
