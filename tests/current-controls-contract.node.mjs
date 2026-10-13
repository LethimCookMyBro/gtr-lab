import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {captureWithTimeoutRetry} from '../scripts/diagnose-configurator-controls-current.mjs';
const base=await readFile(new URL('../scripts/diagnose-configurator-controls.mjs',import.meta.url),'utf8');
const current=await readFile(new URL('../scripts/diagnose-configurator-controls-current.mjs',import.meta.url),'utf8');
const part=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
test('historic driver remains exact',()=>assert.equal(createHash('sha256').update(base).digest('hex'),'3261ecc44eb8ca0a473d4047229c832f6ce655ee065806c4060b508e9078ff0d'));
for(const [a,b] of [["const shot = async label", "const check = async"],["const chooseCamera = async", "    try {"],["let paintPixels =", "      for (const [id, label]"]])test('preserves workload '+a,()=>assert.equal(part(current,a,b),part(base,a,b)));
test('current audit binds prepared model and preserves fixture separation',()=>{assert.match(current,/const cabinRequests = observeCabinRequests\(page\)/);assert.match(current,/auditPreparedCabinAvailability\(\{ page, open, close, cabinRequests, cabinUrl,/);assert.match(current,/\['formula-e', 'Formula E'\]/);assert.doesNotMatch(current,/\['gt500', 'GT500'\]/);assert.match(current,/Specifications only · 3D asset pending/);assert.match(current,/\.reference-view img/);});
test('never retries readiness failure',async()=>{let n=0;const err=Object.assign(new Error('page.waitForFunction: Timeout 15000ms exceeded.'),{name:'TimeoutError'});await assert.rejects(captureWithTimeoutRetry(async()=>{n++;throw err;},async()=>assert.fail()),e=>e===err);assert.equal(n,1);});
test('only one same-capture screenshot retry',async()=>{let n=0,retries=0;const err=Object.assign(new Error('page.screenshot: Timeout 45000ms exceeded.'),{name:'TimeoutError'});const out=await captureWithTimeoutRetry(async()=>{if(++n===1)throw err;return 'pixels';},async()=>retries++);assert.equal(out,'pixels');assert.equal(n,2);assert.equal(retries,1);});

// CPU-only DOM adapter: exercise the actual exported audit without a browser,
// network, control clicks or waiting on a button that is absent by design.
async function missingModelFixture(id) {
  const { JSDOM } = await import('jsdom');
  const { queryAllByRole } = await import('@testing-library/dom');
  const { computeAccessibleName } = await import('dom-accessibility-api');
  const label = id === 'formula-e' ? 'Specifications only · 3D asset pending' : 'Photo reference · 3D asset pending';
  const dom = new JSDOM(`<main class="configurator" data-asset-state="missing">
    <a href="/models">Back to models</a><a href="/" aria-label="GT-R LAB home">GT-R LAB</a>
    <button>Model detail</button><button>Switch model</button><button>${label}</button>
    <div class="scene-stage"><div class="reference-view">${id === 'formula-e' ? '<p>Reference image unavailable</p>' : '<img src="/reference.webp" alt="Reference photograph">'}</div></div>
  </main>`);
  const document = dom.window.document;
  const locate = query => ({
    count: async () => query().length,
    waitFor: async () => assert.equal(query().length, 1, 'Required locator must exist'),
    isVisible: async () => query().length === 1 && dom.window.getComputedStyle(query()[0]).display !== 'none',
    isEnabled: async () => query().length === 1 && !query()[0].disabled,
    getAttribute: async name => query()[0]?.getAttribute(name) ?? null,
  });
  const page = {
    locator: selector => locate(() => [...document.querySelectorAll(selector)]),
    getByRole: (role, options) => locate(() => options.includeHidden
      ? queryAllByRole(document.body, role, { hidden: true }).filter(node => computeAccessibleName(node, { hidden: true }) === options.name)
      : queryAllByRole(document.body, role, options)),
    getByText: text => locate(() => [...document.querySelectorAll('p')].filter(node => node.textContent === text)),
  };
  return { page, document, close: () => dom.window.close() };
}
async function missingAudit() {
  const audit = (await import('../scripts/diagnose-configurator-controls-current.mjs')).auditMissingModelAvailability;
  assert.equal(typeof audit, 'function', 'Missing-model audit must be independently testable without running the CLI');
  return audit;
}
for (const id of ['nismo', 'tspec', 'gtr50', 'gt3', 'formula-e']) {
  test(`${id} audits absent scene controls and retained factual navigation`, async () => {
    const fixture = await missingModelFixture(id);
    try {
      const audit = await missingAudit();
      assert.deepEqual(await audit({ page: fixture.page, id }), {
        canvas: false, sceneControls: false, photoFallback: id !== 'formula-e',
        specificationsOnly: id === 'formula-e', navigationAvailable: true,
      });
    } finally { fixture.close(); }
  });
}
for (const [label, id, mutate] of [
  ['hidden scene tools', 'nismo', document => document.querySelector('main').insertAdjacentHTML('beforeend', '<div class="config-toolbar" style="display:none"><button>Camera</button></div>')],
  ['hidden detached camera button', 'nismo', document => document.querySelector('main').insertAdjacentHTML('beforeend', '<button style="display:none">Camera</button>')],
  ['paint rail', 'nismo', document => document.querySelector('main').insertAdjacentHTML('beforeend', '<footer class="paint-rail"><button>Ultimate Silver</button></footer>')],
  ['rendered canvas', 'nismo', document => document.querySelector('.scene-stage').append(document.createElement('canvas'))],
  ['disabled model navigation', 'nismo', document => [...document.querySelectorAll('button')].find(node => node.textContent === 'Switch model').disabled = true],
  ['missing model detail', 'nismo', document => [...document.querySelectorAll('button')].find(node => node.textContent === 'Model detail').remove()],
  ['wrong collection destination', 'nismo', document => document.querySelector('a').setAttribute('href', '/wrong')],
  ['missing reference photograph', 'nismo', document => document.querySelector('img').remove()],
  ['invented Formula E photograph', 'formula-e', document => document.querySelector('.reference-view').append(document.createElement('img'))],
  ['wrong availability state', 'nismo', document => document.querySelector('main').setAttribute('data-asset-state', 'ready')],
]) {
  test(`missing-model audit rejects ${label}`, async () => {
    const fixture = await missingModelFixture(id);
    try {
      const audit = await missingAudit(); mutate(fixture.document);
      await assert.rejects(audit({ page: fixture.page, id }), { name: 'AssertionError' });
    } finally { fixture.close(); }
  });
}
test('current missing-model loop uses the semantic audit, with no obsolete disabled-button waits', () => {
  const loop = part(current, "      for (const [id, label]", "    } catch (error)");
  assert.match(loop, /auditMissingModelAvailability\(\{ page, id \}\)/);
  assert.doesNotMatch(loop, /Ultimate Silver|isDisabled|open\('Camera'\)|open\('Environment'\)/);
});
