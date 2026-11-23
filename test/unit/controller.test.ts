import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RoamController,
  type Clock,
  type Geometry,
  type RoamHost,
  type RoamState,
  type RoamView,
} from '../../src/controller.ts';
import { normalizeSettings, type RawSettings, type RoamSettings } from '../../src/settings.ts';

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

class FakeClock implements Clock {
  time = 0;
  value = 0.5;
  private timers: { at: number; id: number; run: () => void }[] = [];
  private seq = 0;

  now(): number {
    return this.time;
  }

  random(): number {
    return this.value;
  }

  after(ms: number, run: () => void): () => void {
    const timer = { at: this.time + ms, id: this.seq++, run };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate !== timer);
    };
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.time = next.at;
      next.run();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

class FakeHost implements RoamHost {
  config: RawSettings = {};
  pool: string[] = ['a', 'b', 'c', 'd'];
  failing = new Set<string>();
  lineCount = 400;
  visibleLines = 40;
  gone = false;
  tops = new Map<string, number>();
  live = new Set<string>();
  opened: string[] = [];
  shown: string[] = [];
  closeAlls: boolean[] = [];
  scrolls: number[] = [];
  states: { state: RoamState; detail: string | undefined }[] = [];

  settings(): RoamSettings {
    return normalizeSettings(this.config);
  }

  candidates(): Promise<readonly string[]> {
    return Promise.resolve(this.pool);
  }

  open(key: string): Promise<RoamView | undefined> {
    if (this.failing.has(key)) return Promise.resolve(undefined);
    this.opened.push(key);
    this.tops.set(key, 0);
    this.live.add(key);
    return Promise.resolve({ id: key });
  }

  show(view: RoamView): Promise<boolean> {
    this.shown.push(view.id);
    return Promise.resolve(this.tops.has(view.id));
  }

  geometry(view: RoamView): Geometry | undefined {
    if (this.gone) return undefined;
    return {
      top: this.tops.get(view.id) ?? 0,
      lineCount: this.lineCount,
      visibleLines: this.visibleLines,
    };
  }

  scrollTo(view: RoamView, line: number): void {
    this.tops.set(view.id, line);
    this.scrolls.push(line);
  }

  close(views: readonly RoamView[]): Promise<void> {
    for (const view of views) {
      this.tops.delete(view.id);
      this.live.delete(view.id);
    }
    return Promise.resolve();
  }

  closeAll(focusEditor: boolean): Promise<void> {
    this.closeAlls.push(focusEditor);
    this.tops.clear();
    this.live.clear();
    return Promise.resolve();
  }

  stateChanged(state: RoamState, detail?: string): void {
    this.states.push({ state, detail });
  }
}

function setup(config: RawSettings = {}) {
  const clock = new FakeClock();
  const host = new FakeHost();
  host.config = { idleSeconds: 60, ...config };
  const controller = new RoamController(host, clock);
  controller.start();
  return { clock, host, controller };
}

test('stays off while disabled', async () => {
  const { clock, host, controller } = setup({ enabled: false });
  await clock.advance(600_000);
  assert.equal(controller.state, 'off');
  assert.equal(host.opened.length, 0);
});

test('starts roaming only after the idle period', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(59_000);
  assert.equal(controller.state, 'watching');
  await clock.advance(1_500);
  assert.equal(controller.state, 'roaming');
  assert.equal(host.opened.length, 1);
});

test('activity postpones roaming', async () => {
  const { clock, controller } = setup();
  await clock.advance(50_000);
  controller.noteActivity('other');
  await clock.advance(59_000);
  assert.equal(controller.state, 'watching');
  await clock.advance(2_000);
  assert.equal(controller.state, 'roaming');
});

test('editor activity while roaming closes every roam tab and restarts the idle clock', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(61_000);
  assert.equal(controller.state, 'roaming');
  controller.noteActivity('editor');
  await controller.settled();
  assert.equal(controller.state, 'watching');
  assert.deepEqual(host.closeAlls, [true]);
  assert.equal(host.live.size, 0);
  await clock.advance(59_000);
  assert.equal(controller.state, 'watching');
  await clock.advance(2_000);
  assert.equal(controller.state, 'roaming');
});

test('activity outside the editor leaves focus where it is', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(61_000);
  controller.noteActivity('other');
  await controller.settled();
  assert.deepEqual(host.closeAlls, [false]);
});

test('scrolls at the configured rate', async () => {
  const { clock, host, controller } = setup({
    scrollLinesPerSecond: 10,
    hopMinSeconds: 600,
    hopMaxSeconds: 600,
  });
  await clock.advance(60_000);
  const key = host.opened[0] ?? '';
  await clock.advance(5_000);
  const top = host.tops.get(key) ?? -1;
  assert.ok(top >= 45 && top <= 51, 'top was ' + top);
  assert.equal(controller.state, 'roaming');
});

test('a manual scroll ends roaming', async () => {
  const { clock, host, controller } = setup({ hopMinSeconds: 600, hopMaxSeconds: 600 });
  await clock.advance(63_000);
  const key = host.opened[0] ?? '';
  host.tops.set(key, (host.tops.get(key) ?? 0) + 25);
  await clock.advance(300);
  assert.equal(controller.state, 'watching');
  assert.deepEqual(host.closeAlls, [true]);
});

test('moves to another file after the hop time', async () => {
  const { clock, host } = setup({ hopMinSeconds: 10, hopMaxSeconds: 10 });
  await clock.advance(60_000);
  await clock.advance(11_000);
  assert.equal(host.opened.length, 2);
  assert.notEqual(host.opened[0], host.opened[1]);
});

test('keeps at most the configured number of roam tabs', async () => {
  const { clock, host } = setup({ hopMinSeconds: 5, hopMaxSeconds: 5, maxRoamTabs: 2 });
  host.pool = ['a', 'b', 'c', 'd', 'e', 'f'];
  clock.value = 0.99;
  await clock.advance(60_000);
  await clock.advance(40_000);
  assert.ok(host.opened.length >= 4, 'opened ' + host.opened.length);
  assert.ok(host.live.size <= 2, 'live ' + host.live.size);
});

test('sometimes switches back to an open roam tab', async () => {
  const { clock, host } = setup({ hopMinSeconds: 5, hopMaxSeconds: 5 });
  clock.value = 0.1;
  await clock.advance(60_000);
  await clock.advance(40_000);
  assert.ok(host.shown.length > 0);
});

test('moves on after reaching the end of a short file', async () => {
  const { clock, host } = setup();
  host.lineCount = 60;
  await clock.advance(60_000);
  await clock.advance(8_000);
  assert.ok(host.scrolls.includes(20));
  assert.equal(host.opened.length, 2);
});

test('skips files that cannot be opened', async () => {
  const { clock, host, controller } = setup();
  host.pool = ['bad', 'good'];
  host.failing.add('bad');
  clock.value = 0;
  await clock.advance(61_000);
  assert.deepEqual(host.opened, ['good']);
  assert.equal(controller.state, 'roaming');
});

test('returns to watching when the workspace has nothing to show', async () => {
  const { clock, host, controller } = setup();
  host.pool = [];
  await clock.advance(61_000);
  assert.equal(controller.state, 'watching');
  assert.ok(host.states.some((entry) => entry.detail === 'no-files'));
});

test('recovers when the host throws', async () => {
  const { clock, host, controller } = setup();
  host.candidates = (): Promise<readonly string[]> => Promise.reject(new Error('boom'));
  await clock.advance(61_000);
  assert.equal(controller.state, 'watching');
  assert.ok(host.states.some((entry) => entry.detail === 'error: boom'));
});

test('a roam tab closed by the user ends roaming', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(61_000);
  host.gone = true;
  await clock.advance(300);
  assert.equal(controller.state, 'watching');
  assert.deepEqual(host.closeAlls, [false]);
});

test('dispose closes the roam tabs and cancels timers', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(61_000);
  await controller.dispose();
  assert.equal(host.closeAlls.length, 1);
  await clock.advance(600_000);
  assert.equal(host.opened.length, 1);
});

test('start now roams even when disabled and returns to off afterwards', async () => {
  const { host, controller } = setup({ enabled: false });
  await controller.startNow();
  assert.equal(controller.state, 'roaming');
  assert.equal(host.opened.length, 1);
  await controller.stop();
  assert.equal(controller.state, 'off');
});

test('turning the setting off ends roaming', async () => {
  const { clock, host, controller } = setup();
  await clock.advance(61_000);
  host.config = { idleSeconds: 60, enabled: false };
  controller.refresh();
  await controller.settled();
  assert.equal(controller.state, 'off');
});

test('never repeats the previous file back to back', async () => {
  const { clock, host } = setup({ hopMinSeconds: 5, hopMaxSeconds: 5 });
  host.pool = ['a', 'b'];
  clock.value = 0.99;
  await clock.advance(60_000);
  await clock.advance(60_000);
  assert.ok(host.opened.length >= 3);
  for (let index = 1; index < host.opened.length; index += 1) {
    assert.notEqual(host.opened[index], host.opened[index - 1]);
  }
});
