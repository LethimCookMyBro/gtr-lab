import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const readConfig = () => JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
test('Vercel builds the verified assets and deploys only static dist', () => {
  const config = readConfig();
  expect(config.framework).toBe('vite');
  expect(config.buildCommand).toBe('npm run build');
  expect(config.installCommand).toBe('npm ci');
  expect(config.outputDirectory).toBe('dist');
  expect(config.functions).toBeUndefined();
});
test('deep links receive the SPA without rewriting missing asset requests to HTML', () => {
  const config = readConfig();
  expect(config.rewrites).toEqual([{source: '/([^.]*)', destination: '/index.html'}]);
  const matcher = new RegExp(`^${config.rewrites[0].source}$`);
  for (const path of ['/', '/models', '/heritage', '/credits', '/about', '/configurator', '/configurator/premium', '/unknown']) expect(matcher.test(path)).toBe(true);
  for (const path of ['/models/missing.glb', '/assets/missing.js', '/films/missing.mp4', '/environments/missing.hdr']) expect(matcher.test(path)).toBe(false);
});
test('preserves the production security policy without widening any source', () => {
  const all = readConfig().headers.find(rule => rule.source === '/(.*)');
  const headers = Object.fromEntries(all.headers.map(({key, value}) => [key, value]));
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  expect(headers['Content-Security-Policy']).toBe(server.match(/const CSP =\s*"([^"]+)";/)[1]);
  expect(headers['X-Content-Type-Options']).toBe('nosniff');
  expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
});
test('HTML revalidates while only fingerprinted bundles use immutable caching', () => {
  const rules = readConfig().headers;
  expect(rules.find(rule => rule.source === '/(.*)').headers).toContainEqual({key:'Cache-Control',value:'no-cache'});
  expect(rules.filter(rule => rule.headers.some(header => header.value.includes('immutable'))).map(rule => rule.source)).toEqual(['/assets/(.*)']);
});
