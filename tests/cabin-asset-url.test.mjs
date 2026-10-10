import { expect, test } from 'vitest';
import { CABIN_URL } from '../src/components/three/cabinPreview';
import { cabinModels } from '../scripts/cabin-integration-policy.mjs';
test('the refined cabin uses a new content-versioned URL rather than the hour-cached baseline path', () => {
  expect(CABIN_URL).toBe('/models/r35-cabin-realism-0b72bab4.glb');
  expect(cabinModels[0].path).toBe(CABIN_URL);
});
