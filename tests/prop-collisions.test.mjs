import assert from 'node:assert/strict';
import test from 'node:test';
import { createPropCollisions } from '../src/prop-collisions.js';

test('padded and rotated obstacles match a full scan across cell boundaries', () => {
  const padding = 0.35, grid = createPropCollisions(padding);
  const boxes = [
    { x: -8.2, z: 8, halfWidth: 1.5, halfDepth: 0.4, cos: 1, sin: 0 },
    { x: 0, z: -8, halfWidth: 21, halfDepth: 0.25, cos: Math.cos(0.7), sin: Math.sin(0.7) },
  ];
  assert.equal(grid.contains(0, -8), false);
  boxes.forEach(grid.add);
  for (let x = -26; x <= 26; x += 0.25) for (let z = -26; z <= 26; z += 0.25) {
    const expected = boxes.some(box => {
      const dx = x - box.x, dz = z - box.z;
      return Math.abs(dx * box.cos - dz * box.sin) < box.halfWidth + padding &&
        Math.abs(dx * box.sin + dz * box.cos) < box.halfDepth + padding;
    });
    assert.equal(grid.contains(x, z), expected, `position ${x}, ${z}`);
  }
});
