import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cabinModels, isExpectedCabinRequestFailure, isExpectedCabinBodyError } from '../scripts/cabin-integration-policy.mjs';

const full = cabinModels[0].path, proxy = cabinModels[2].path;
const oppositeArrival = 'Proxy arrives while full cabin is in-flight and cancellation restores it';
// Exact normalized failure/response pairs shared by both passing 20809cf lanes.
// Report SHA256: desktop 4c1a3fe0e25c149aea1a178156fcc6de4013180cf3fcf11db7fddb347e4ec3c8;
// mobile f0a7b3b9f4168bb44a3244cea980a412167ca081278ae1ee718baa2ea2e0affb.
const observed = [
  [3, full, 'Delayed download cancel and stale response ignored', 200, 'held-stream'],
  [4, full, 'Missing cabin preserves exterior and Retry loads real asset', 404, 'missing'],
  [7, full, 'In-flight cabin switch tears down and all other five stay photographic', 200, 'held-stream'],
  [17, proxy, 'Missing window proxy is nonblocking and a fresh Premium entry retries it', 404, 'missing'],
  [22, proxy, 'In-flight window proxy model switch cancels without late resurrection', 200, 'held-stream'],
  [26, proxy, 'In-flight window proxy context-loss cancel and explicit viewer retry', 200, 'held-stream'],
  [34, full, oppositeArrival, 200, 'held-stream'],
];
const pair = ([requestId, path, phase, status, injectedFault]) => ({
  failure: { requestId, path, phase, failure: 'net::ERR_ABORTED' },
  response: { requestId, path, phase, status, injectedFault },
});

describe('cancellation belongs to the exact scenario and model', () => {
  it.each(observed)('preserves actual deliberately injected failure %i', (...row) => {
    const { failure, response } = pair(row);
    expect(isExpectedCabinRequestFailure(failure, [response])).toBe(true);
    // Inspector body-error correlation must preserve the same ownership rules.
    expect(isExpectedCabinBodyError({ ...response, bodyError: 'No resource with given identifier found' }, [failure])).toBe(true);
  });

  it('rejects proxy 33 while retaining full-cabin 34 in the same arrival scenario', () => {
    const completedProxy = pair([33, proxy, oppositeArrival, 200, 'held-stream']);
    const cancelledFull = pair(observed.at(-1));
    const responses = [completedProxy.response, cancelledFull.response];
    expect(isExpectedCabinRequestFailure(completedProxy.failure, responses)).toBe(false);
    expect(isExpectedCabinRequestFailure(cancelledFull.failure, responses)).toBe(true);
    expect(isExpectedCabinBodyError({ ...completedProxy.response, bodyError: 'Protocol error: No data found' },
      [completedProxy.failure, cancelledFull.failure])).toBe(false);
  });

  it.each(observed.filter(row => row[3] === 200))('rejects the other model in cancellation scenario %i', (...row) => {
    const { failure, response } = pair(row);
    const other = failure.path === full ? proxy : full;
    expect(isExpectedCabinRequestFailure({ ...failure, path: other }, [{ ...response, path: other }])).toBe(false);
  });

  it.each([
    'cancel', 'in-flight', 'An unrelated in-flight task',
    'Delayed download cancel and stale response ignored extra',
    'prefix In-flight window proxy model switch cancels without late resurrection',
    oppositeArrival.toLowerCase(), '', undefined,
  ])('rejects fuzzy or unknown scenario %s', phase => {
    for (const path of [full, proxy]) {
      const { failure, response } = pair([3, path, phase, 200, 'held-stream']);
      expect(isExpectedCabinRequestFailure(failure, [response])).toBe(false);
    }
  });

  it.each(observed.filter(row => row[3] === 200 && row[0] !== 34))('keeps public throttled full-cabin ownership bounded for scenario %i', (...row) => {
    const { failure, response } = pair(row);
    if (failure.path === full) {
      expect(isExpectedCabinRequestFailure(failure, [{ ...response, injectedFault: 'throttled-stream' }])).toBe(true);
    } else {
      expect(isExpectedCabinRequestFailure({ ...failure, path: full },
        [{ ...response, path: full, injectedFault: 'throttled-stream' }])).toBe(false);
    }
  });

  it('retains fail-closed ID, path, response, status and marker boundaries', () => {
    const { failure, response } = pair(observed.at(-1));
    for (const candidate of [
      { ...response, requestId: 33 }, { ...response, path: proxy },
      { ...response, status: 500 }, { ...response, injectedFault: undefined },
    ]) expect(isExpectedCabinRequestFailure(failure, [candidate])).toBe(false);
    expect(isExpectedCabinRequestFailure({ ...failure, failure: 'net::ERR_FAILED' }, [response])).toBe(false);
    expect(isExpectedCabinRequestFailure({ ...failure, requestId: undefined }, [response])).toBe(false);
    expect(isExpectedCabinRequestFailure(failure, [response], proxy)).toBe(false);
  });

  it('ties fixture scenarios to actual driver check names', () => {
    const driver = readFileSync('scripts/capture-cabin-preview.mjs', 'utf8');
    for (const row of observed) expect(driver).toContain(`await check('${row[2]}'`);
  });
});
