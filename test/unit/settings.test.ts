import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EXCLUDE, normalizeSettings } from '../../src/settings.ts';

test('empty input yields the documented defaults', () => {
  assert.deepEqual(normalizeSettings({}), {
    enabled: true,
    idleSeconds: 60,
    hopMinSeconds: 8,
    hopMaxSeconds: 25,
    scrollLinesPerSecond: 6,
    maxRoamTabs: 4,
    maxFileSizeKb: 512,
    exclude: DEFAULT_EXCLUDE,
  });
});

test('numbers are clamped to their bounds', () => {
  const settings = normalizeSettings({
    idleSeconds: 1,
    scrollLinesPerSecond: 500,
    maxRoamTabs: 99,
    maxFileSizeKb: -4,
  });
  assert.equal(settings.idleSeconds, 5);
  assert.equal(settings.scrollLinesPerSecond, 60);
  assert.equal(settings.maxRoamTabs, 10);
  assert.equal(settings.maxFileSizeKb, 1);
});

test('the longest hop is never shorter than the shortest', () => {
  const settings = normalizeSettings({ hopMinSeconds: 30, hopMaxSeconds: 10 });
  assert.equal(settings.hopMinSeconds, 30);
  assert.equal(settings.hopMaxSeconds, 30);
});

test('non numeric values fall back to defaults', () => {
  const settings = normalizeSettings({ idleSeconds: 'soon', hopMinSeconds: NaN, maxRoamTabs: null });
  assert.equal(settings.idleSeconds, 60);
  assert.equal(settings.hopMinSeconds, 8);
  assert.equal(settings.maxRoamTabs, 4);
});

test('only non empty string patterns survive in exclude', () => {
  const settings = normalizeSettings({ exclude: ['**/a/**', '', 3, '**/b/**'] });
  assert.deepEqual(settings.exclude, ['**/a/**', '**/b/**']);
});

test('enabled is only false when explicitly false', () => {
  assert.equal(normalizeSettings({ enabled: false }).enabled, false);
  assert.equal(normalizeSettings({ enabled: 'no' }).enabled, true);
});
