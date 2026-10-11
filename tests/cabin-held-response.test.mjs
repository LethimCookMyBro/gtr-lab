import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { cabinModels, networkFaultHeader, isExpectedCabinRequestFailure } from '../scripts/cabin-integration-policy.mjs';
import { observeCabinFaultResponse, cabinLoadTime } from '../scripts/cabin-load-lifecycle.mjs';

const driver = readFileSync('scripts/capture-cabin-preview.mjs', 'utf8');
const syntax = ts.createSourceFile('capture-cabin-preview.mjs', driver, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const serverCallbacks = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(syntax) === 'createServer') serverCallbacks.push(node.arguments[0]);
  ts.forEachChild(node, visit);
}
visit(syntax);

// Execute the driver's actual fault callback against an in-memory response.
// Never call createServer, listen, browser launch, or main in this CPU test.
function fixture(kind, modelIndex) {
  expect(serverCallbacks).toHaveLength(1);
  const proxyPath = cabinModels[2].path;
  const cabin = Buffer.alloc(cabinModels[0].bytes, 0x43);
  const proxy = Buffer.alloc(cabinModels[2].bytes, 0x50);
  const fault = { kind, path: cabinModels[modelIndex].path };
  const pendingGates = new Set(), productionHandler = vi.fn();
  const names = ['nextFault', 'productionHandler', 'observeCabinFaultResponse', 'networkFaultHeader', 'proxyPath', 'proxy', 'cabin', 'pendingGates', 'cabinLoadTime'];
  const handler = new Function(...names, `return (${serverCallbacks[0].getText(syntax)});`)(
    fault, productionHandler, observeCabinFaultResponse, networkFaultHeader, proxyPath, proxy, cabin, pendingGates, cabinLoadTime,
  );
  const request = Object.assign(new EventEmitter(), { url: fault.path });
  const response = Object.assign(new EventEmitter(), {
    destroyed: false, writeHead: vi.fn(), write: vi.fn(), end: vi.fn(),
  });
  return { fault, handler, request, response, pendingGates, productionHandler, bytes: modelIndex === 2 ? proxy : cabin };
}

describe('held model response uses production transport semantics', () => {
  it.each([0, 2])('matches ordinary GLB cache headers while retaining real partial bytes for model %i', index => {
    const { handler, request, response, fault, pendingGates, bytes } = fixture('held-stream', index);
    handler(request, response);
    expect(response.writeHead).toHaveBeenCalledExactlyOnceWith(200, {
      'Content-Type': 'model/gltf-binary', 'Content-Length': bytes.length,
      'Cache-Control': 'public,max-age=3600', [networkFaultHeader]: 'held-stream',
    });
    const partial = index === 2 ? 65_536 : 1_048_576;
    expect(response.write).toHaveBeenCalledTimes(1);
    expect(response.write.mock.calls[0][0].equals(bytes.subarray(0, partial))).toBe(true);
    expect(response.end).not.toHaveBeenCalled();
    expect(fault.sentBytes).toBe(partial);
    expect(pendingGates.has(fault)).toBe(true);
    fault.release();
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(response.end.mock.calls[0][0].equals(bytes.subarray(partial))).toBe(true);
    expect(Buffer.concat([response.write.mock.calls[0][0], response.end.mock.calls[0][0]]).equals(bytes)).toBe(true);
    expect(fault.clientAlreadyClosed).toBe(false);
    expect(fault.released).toBe(true);
    expect(pendingGates.size).toBe(0);
  });

  it.each([0, 2])('preserves cancellation of an unfinished held model %i', index => {
    const { handler, request, response, fault, pendingGates } = fixture('held-stream', index);
    handler(request, response);
    response.destroyed = true;
    response.emit('close');
    fault.release();
    expect(response.end).not.toHaveBeenCalled();
    expect(fault.clientAlreadyClosed).toBe(true);
    expect(fault.closed).toBe(true);
    expect(pendingGates.size).toBe(0);
  });

  it.each([0, 2])('keeps injected missing model %i no-store and outside the held gate', index => {
    const { handler, request, response, fault, pendingGates } = fixture('missing', index);
    handler(request, response);
    expect(response.writeHead).toHaveBeenCalledExactlyOnceWith(404, {
      'Content-Type': 'text/plain', 'Cache-Control': 'no-store', [networkFaultHeader]: 'missing',
    });
    expect(response.end).toHaveBeenCalledExactlyOnceWith('Intentional cabin-only 404 for recovery verification');
    expect(response.write).not.toHaveBeenCalled();
    expect(fault.finished).toBe(true);
    expect(pendingGates.size).toBe(0);
  });

  it('delegates unrelated and subsequent requests to the unchanged production server', () => {
    const { handler, request, response, productionHandler } = fixture('held-stream', 2);
    const exterior = Object.assign(new EventEmitter(), { url: cabinModels[1].path });
    handler(exterior, response);
    expect(productionHandler).toHaveBeenCalledExactlyOnceWith(exterior, response);
    handler(request, response);
    handler(request, response);
    expect(productionHandler).toHaveBeenCalledTimes(2);
    expect(response.writeHead).toHaveBeenCalledTimes(1);
  });

  it('disables browser caching before navigation and retains strict unexpected-abort/body verification', () => {
    const disable = driver.indexOf("await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });");
    expect(disable).toBeGreaterThan(-1);
    expect(disable).toBeLessThan(driver.indexOf('await page.goto('));
    expect(driver).not.toMatch(/cacheDisabled:\s*false/);
    expect(driver).toContain('await runtimeBodies.verify(report.responses, report.requestFailures)');
    for (const phase of ['Initial exterior, WebGL and opt-in boundary', 'Full cabin arrives before proxy and late proxy remains hidden']) {
      expect(isExpectedCabinRequestFailure({ requestId: 2, path: cabinModels[2].path, phase, failure: 'net::ERR_ABORTED' },
        [{ requestId: 2, path: cabinModels[2].path, status: 200, injectedFault: 'held-stream' }])).toBe(false);
    }
    const server = readFileSync('server.mjs', 'utf8');
    expect(server).toContain('"public,max-age=3600"');
  });
});
