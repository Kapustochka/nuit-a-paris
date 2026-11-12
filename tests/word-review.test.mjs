import test from 'node:test';
import assert from 'node:assert/strict';
import { createWordReview } from '../src/word-review.js';

const MINUTE = 60_000;
function setup(keys = [], raw = '{}') {
  const found = new Set(keys), values = new Map([['nuit-a-paris:review:v1', raw]]);
  let time = 1_800_000_000_000;
  const options = { now: () => time, storage: () => ({ getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) }) };
  return { found, options, review: createWordReview(found, options), advance: (ms) => { time += ms; } };
}

test('old notebooks work; only collected words are eligible, not songs or stories', () => {
  const { review } = setup(['song:0', 'story:0', 'phrase:0', 'missing', 'window']);
  assert.equal(review.pick(), 'window');
  assert.equal(review.rate('door', false), null);
  assert.equal(review.rate('song:0', true), null);
  assert.equal(setup().review.pick(), null);
});

test('new words wait two minutes; reopening a card does not postpone review', () => {
  const { review, found, advance } = setup();
  found.add('window'); review.learn('window');
  assert.equal(review.pick(), null);
  advance(MINUTE); review.learn('window');
  advance(MINUTE); assert.equal(review.pick(), 'window');
  assert.equal(review.pick(), 'window'); // closing or skipping is not a successful answer
});

test('forgotten words return earlier; success grows intervals and survives reload', () => {
  const { review, options, advance } = setup(['window']);
  assert.equal(review.rate('window', false), MINUTE);
  assert.equal(review.pick(), null);
  advance(MINUTE); assert.equal(review.pick(), 'window');
  assert.equal(review.rate('window', true), 10 * MINUTE);
  const restored = createWordReview(new Set(['window']), options);
  advance(9 * MINUTE); assert.equal(restored.pick(), null);
  advance(MINUTE); assert.equal(restored.pick(), 'window');
  assert.equal(restored.rate('window', true), 24 * 60 * MINUTE);
  assert.equal(restored.rate('window', false), MINUTE);
  assert.equal(restored.rate('window', true), 10 * MINUTE);
});

test('overdue words come first; corrupt and unavailable storage remain usable', () => {
  const { review, advance } = setup(['window', 'door']);
  review.rate('window', false);
  assert.equal(review.pick(), 'door');
  review.rate('door', true); advance(MINUTE);
  assert.equal(review.pick(), 'window');
  for (const raw of ['broken', 'null', '{"window":{"due":"never","streak":4}}']) {
    assert.equal(setup(['window'], raw).review.pick(), 'window');
  }
  const blocked = createWordReview(new Set(['window']), { storage: () => { throw Error('denied'); } });
  assert.equal(blocked.pick(), 'window');
  assert.equal(blocked.rate('window', false), MINUTE);
  assert.equal(blocked.pick(), null);
});

test('a due forgotten word takes priority over a backlog of old notebook words', () => {
  const { review, advance, options } = setup(['window', 'door', 'lamp']);
  review.rate('lamp', false);
  assert.equal(review.pick(), 'window');
  advance(MINUTE);
  const restored = createWordReview(new Set(['window', 'door', 'lamp']), options);
  assert.equal(restored.pick(), 'lamp');
  restored.rate('lamp', true);
  assert.equal(restored.pick(), 'window');
});
