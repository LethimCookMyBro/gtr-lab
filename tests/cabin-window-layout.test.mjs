import { expect, it } from 'vitest';
import { assertCabinWindowLayout } from '../scripts/cabin-window-layout.mjs';

const layout = (width = 390) => ({
  viewport: { width, height: 844 }, hidden: false, rendered: true,
  button: { left: 24, top: 163, right: 230, bottom: 207, width: 206, height: 44 },
  status: { left: 46, top: 209, right: 250, bottom: 224, width: 204, height: 15 },
  header: { bottom: 230 }, textFits: true,
});
it.each([390, 1440])('accepts bounded, non-overlapping status at viewport %s', width => {
  expect(() => assertCabinWindowLayout(layout(width))).not.toThrow();
});
it.each([
  ['overlap', value => { value.status.top = 200; }, /without overlap/],
  ['detached', value => { value.status.top = 230; }, /adjacent/],
  ['horizontal overflow', value => { value.status.right = 391; }, /viewport width/],
  ['clipped text', value => { value.textFits = false; }, /unclipped/],
  ['three lines', value => { value.status.height = 43; }, /two unclipped lines/],
  ['mobile header overflow', value => { value.status.bottom = 231; }, /stays in the header/],
  ['undersized button', value => { value.button.height = 30; }, /touch target/],
  ['missing exterior status', value => { value.rendered = false; }, /remains visible/],
])('rejects %s', (_name, change, error) => {
  const value = layout(); change(value);
  expect(() => assertCabinWindowLayout(value)).toThrow(error);
});
it('requires the active-cabin hidden status to actually be unpainted', () => {
  const value = { ...layout(), hidden: true, rendered: false };
  expect(() => assertCabinWindowLayout(value)).not.toThrow();
  expect(() => assertCabinWindowLayout({ ...value, rendered: true })).toThrow(/not painted/);
});
