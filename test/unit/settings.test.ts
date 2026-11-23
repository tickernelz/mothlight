import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EXCLUDE, normalizeSettings } from '../../src/settings.ts';

test('empty input yields the documented defaults', () => {
  assert.deepEqual(normalizeSettings({}), {
    enabled: true,
    followExplorer: true,
    idleSeconds: 60,
    moveMinSeconds: 5,
    moveMaxSeconds: 12,
    pauseMinSeconds: 30,
    pauseMaxSeconds: 90,
    scrollLinesPerSecond: 6,
    maxRoamTabs: 3,
    maxFileSizeKb: 256,
    exclude: DEFAULT_EXCLUDE,
  });
});

test('numbers are clamped to their bounds', () => {
  const settings = normalizeSettings({
    idleSeconds: 1,
    moveMinSeconds: 0,
    pauseMinSeconds: 0,
    scrollLinesPerSecond: 500,
    maxRoamTabs: 99,
    maxFileSizeKb: -4,
  });
  assert.equal(settings.idleSeconds, 5);
  assert.equal(settings.moveMinSeconds, 2);
  assert.equal(settings.pauseMinSeconds, 1);
  assert.equal(settings.scrollLinesPerSecond, 60);
  assert.equal(settings.maxRoamTabs, 10);
  assert.equal(settings.maxFileSizeKb, 1);
});

test('a longest time is never shorter than its shortest', () => {
  const settings = normalizeSettings({
    moveMinSeconds: 30,
    moveMaxSeconds: 10,
    pauseMinSeconds: 300,
    pauseMaxSeconds: 100,
  });
  assert.equal(settings.moveMaxSeconds, 30);
  assert.equal(settings.pauseMaxSeconds, 300);
});

test('non numeric values fall back to defaults', () => {
  const settings = normalizeSettings({ idleSeconds: 'soon', moveMinSeconds: NaN, pauseMinSeconds: null, maxRoamTabs: null });
  assert.equal(settings.idleSeconds, 60);
  assert.equal(settings.moveMinSeconds, 5);
  assert.equal(settings.pauseMinSeconds, 30);
  assert.equal(settings.maxRoamTabs, 3);
});

test('only non empty string patterns survive in exclude', () => {
  const settings = normalizeSettings({ exclude: ['**/a/**', '', 3, '**/b/**'] });
  assert.deepEqual(settings.exclude, ['**/a/**', '**/b/**']);
});

test('enabled is only false when explicitly false', () => {
  assert.equal(normalizeSettings({ enabled: false }).enabled, false);
  assert.equal(normalizeSettings({ enabled: 'no' }).enabled, true);
});

test('followExplorer is only false when explicitly false', () => {
  assert.equal(normalizeSettings({ followExplorer: false }).followExplorer, false);
  assert.equal(normalizeSettings({ followExplorer: 'no' }).followExplorer, true);
  assert.equal(normalizeSettings({}).followExplorer, true);
});
