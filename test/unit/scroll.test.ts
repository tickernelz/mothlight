import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planScroll } from '../../src/scroll.ts';

test('the start is spread over the whole file', () => {
  assert.equal(planScroll(360, 0, 0).start, 0);
  assert.equal(planScroll(360, 0.5, 0).start, 180);
  assert.equal(planScroll(360, 0.9999, 0).start, 360);
});

test('a low direction draw scrolls down and a high one up', () => {
  assert.equal(planScroll(360, 0.5, 0.1).direction, 1);
  assert.equal(planScroll(360, 0.5, 0.9).direction, -1);
});

test('turns around when there is no room in the wanted direction', () => {
  assert.deepEqual(planScroll(360, 0.9999, 0.1), { start: 360, direction: -1 });
  assert.deepEqual(planScroll(360, 0, 0.9), { start: 0, direction: 1 });
});

test('a file shorter than the screen stays at the top', () => {
  assert.equal(planScroll(0, 0.7, 0.1).start, 0);
  assert.equal(planScroll(-5, 0.7, 0.9).start, 0);
});
