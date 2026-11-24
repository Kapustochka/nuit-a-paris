import test from 'node:test';
import assert from 'node:assert/strict';
import { planEvening, eveningKey, TASKS } from '../src/evening.js';

test('an evening has four tasks, always a talk, only available ones, stable for the evening', () => {
  const all = new Set(['place', 'star', 'review', 'cafe']);
  const plan = planEvening('2026-11-24', all);
  assert.equal(plan.length, 4);
  assert.equal(plan[0], 'talk');
  assert.equal(new Set(plan).size, 4);
  assert.deepEqual(planEvening('2026-11-24', all), plan);
  for (let d = 1; d <= 28; d++) {
    const p = planEvening(`2026-12-${String(d).padStart(2, '0')}`, new Set());
    assert.ok(p.every((id) => !['place', 'star', 'review', 'cafe'].includes(id)), p.join());
    assert.ok(p.every((id) => TASKS.some(([t]) => t === id)));
  }
  const seen = new Set();
  for (let d = 1; d <= 28; d++) planEvening(`2026-12-${d}`, all).forEach((id) => seen.add(id));
  assert.equal(seen.size, TASKS.length);
});

test('one in the morning still belongs to the previous evening', () => {
  assert.equal(eveningKey(new Date(2026, 10, 25, 1, 30)), '2026-11-24');
  assert.equal(eveningKey(new Date(2026, 10, 25, 19, 0)), '2026-11-25');
});
