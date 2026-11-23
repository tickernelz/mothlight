import type { RoamSettings } from './settings.ts';

export type RoamState = 'off' | 'watching' | 'roaming';
export type ActivitySource = 'editor' | 'other';

export interface RoamView {
  readonly id: string;
}

export interface Geometry {
  top: number;
  lineCount: number;
  visibleLines: number;
}

export interface RoamHost {
  settings(): RoamSettings;
  candidates(): Promise<readonly string[]>;
  open(key: string): Promise<RoamView | undefined>;
  show(view: RoamView): Promise<boolean>;
  geometry(view: RoamView): Geometry | undefined;
  scrollTo(view: RoamView, line: number): void;
  close(views: readonly RoamView[]): Promise<void>;
  closeAll(focusEditor: boolean): Promise<void>;
  stateChanged(state: RoamState, detail?: string): void;
}

export interface Clock {
  now(): number;
  after(ms: number, run: () => void): () => void;
  random(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  random: () => Math.random(),
};

const TICK_MS = 100;
const END_PAUSE_MS = 2000;
const GRACE_MS = 400;
const SWITCH_PROBABILITY = 0.3;
const MAX_OPEN_ATTEMPTS = 5;
const RECENT_LIMIT = 8;
const MAX_TICK_STEP_MS = 500;

export class RoamController {
  private readonly host: RoamHost;
  private readonly clock: Clock;
  private current: RoamState = 'off';
  private session = 0;
  private lastActivity = 0;
  private cancelWatch: (() => void) | undefined;
  private cancelTick: (() => void) | undefined;
  private stopping: Promise<void> | undefined;
  private disposed = false;
  private pool: readonly string[] = [];
  private recent: string[] = [];
  private rejected = new Set<string>();
  private views: RoamView[] = [];
  private focus: RoamView | undefined;
  private position = 0;
  private commanded = 0;
  private lastTick = 0;
  private hopAt = 0;
  private graceUntil = 0;
  private endedAt: number | undefined;

  constructor(host: RoamHost, clock: Clock = systemClock) {
    this.host = host;
    this.clock = clock;
  }

  get state(): RoamState {
    return this.current;
  }

  start(): void {
    this.lastActivity = this.clock.now();
    this.refresh();
  }

  refresh(): void {
    if (this.disposed) return;
    if (!this.host.settings().enabled) {
      if (this.current === 'roaming') {
        void this.finish(false);
      } else {
        this.cancelWatch?.();
        this.cancelWatch = undefined;
        this.setState('off');
      }
      return;
    }
    if (this.current === 'roaming') return;
    if (this.current === 'off') this.lastActivity = this.clock.now();
    this.setState('watching');
    this.scheduleWatch();
  }

  noteActivity(source: ActivitySource): void {
    if (this.disposed) return;
    this.lastActivity = this.clock.now();
    if (this.current === 'roaming') void this.finish(source === 'editor');
  }

  async startNow(): Promise<void> {
    if (this.disposed || this.current === 'roaming') return;
    this.lastActivity = this.clock.now();
    await this.beginRoaming();
  }

  stop(): Promise<void> {
    return this.current === 'roaming' ? this.finish(true) : Promise.resolve();
  }

  settled(): Promise<void> {
    return this.stopping ?? Promise.resolve();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cancelWatch?.();
    this.cancelWatch = undefined;
    if (this.current === 'roaming') await this.finish(false);
  }

  private setState(state: RoamState, detail?: string): void {
    this.current = state;
    this.host.stateChanged(state, detail);
  }

  private idleMs(): number {
    return this.host.settings().idleSeconds * 1000;
  }

  private scheduleWatch(): void {
    this.cancelWatch?.();
    const wait = Math.max(0, this.lastActivity + this.idleMs() - this.clock.now());
    this.cancelWatch = this.clock.after(wait, () => this.onWatchTimer());
  }

  private onWatchTimer(): void {
    this.cancelWatch = undefined;
    if (this.current !== 'watching') return;
    if (this.lastActivity + this.idleMs() - this.clock.now() > 0) {
      this.scheduleWatch();
      return;
    }
    void this.beginRoaming();
  }

  private async beginRoaming(): Promise<void> {
    if (this.current === 'roaming') return;
    this.cancelWatch?.();
    this.cancelWatch = undefined;
    this.session += 1;
    const session = this.session;
    this.views = [];
    this.focus = undefined;
    this.recent = [];
    this.rejected.clear();
    this.setState('roaming');
    try {
      this.pool = await this.host.candidates();
      if (session !== this.session) return;
      if (this.pool.length === 0) {
        await this.finish(false, 'no-files');
        return;
      }
      await this.hop(session);
    } catch (error) {
      this.fail(session, error);
    }
  }

  private fail(session: number, error: unknown): void {
    if (session !== this.session) return;
    const message = error instanceof Error ? error.message : String(error);
    void this.finish(false, 'error: ' + message);
  }

  private finish(focusEditor: boolean, detail?: string): Promise<void> {
    if (this.stopping) return this.stopping;
    this.session += 1;
    this.cancelTick?.();
    this.cancelTick = undefined;
    this.views = [];
    this.focus = undefined;
    this.stopping = this.host
      .closeAll(focusEditor)
      .catch(() => undefined)
      .finally(() => {
        this.stopping = undefined;
        this.afterRoaming(detail);
      });
    return this.stopping;
  }

  private afterRoaming(detail?: string): void {
    if (this.disposed) return;
    this.lastActivity = this.clock.now();
    if (this.host.settings().enabled) {
      this.setState('watching', detail);
      this.scheduleWatch();
    } else {
      this.setState('off', detail);
    }
  }

  private between(min: number, max: number): number {
    return min + this.clock.random() * (max - min);
  }

  private pickKey(): string | undefined {
    const avoid = new Set<string>([...this.recent, ...this.rejected]);
    const fresh = this.pool.filter((key) => !avoid.has(key));
    const source = fresh.length > 0 ? fresh : this.pool.filter((key) => !this.rejected.has(key));
    if (source.length === 0) return undefined;
    return source[Math.floor(this.clock.random() * source.length)];
  }

  private remember(key: string): void {
    this.recent.push(key);
    const limit = Math.min(RECENT_LIMIT, this.pool.length - 1);
    while (this.recent.length > limit) this.recent.shift();
  }

  private async openNext(session: number): Promise<RoamView | undefined> {
    for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt += 1) {
      const key = this.pickKey();
      if (key === undefined) return undefined;
      const view = await this.host.open(key);
      if (session !== this.session) return view;
      if (view) {
        this.remember(key);
        return view;
      }
      this.rejected.add(key);
    }
    return undefined;
  }

  private async hop(session: number): Promise<void> {
    if (session !== this.session) return;
    this.cancelTick?.();
    this.cancelTick = undefined;
    const settings = this.host.settings();
    let view: RoamView | undefined;
    if (this.views.length >= 2 && this.clock.random() < SWITCH_PROBABILITY) {
      const others = this.views.filter((candidate) => candidate !== this.focus);
      const pick = others[Math.floor(this.clock.random() * others.length)];
      if (pick) {
        if (await this.host.show(pick)) view = pick;
        else this.views = this.views.filter((candidate) => candidate !== pick);
      }
      if (session !== this.session) return;
    }
    if (!view) {
      view = await this.openNext(session);
      if (session !== this.session) {
        if (view) await this.host.close([view]);
        return;
      }
    }
    if (!view) {
      await this.finish(false, 'no-files');
      return;
    }
    if (!this.views.includes(view)) this.views.push(view);
    this.focus = view;
    const excess = this.views.length - settings.maxRoamTabs;
    if (excess > 0) {
      const dropped = this.views.filter((candidate) => candidate !== view).slice(0, excess);
      this.views = this.views.filter((candidate) => !dropped.includes(candidate));
      await this.host.close(dropped);
      if (session !== this.session) return;
    }
    const now = this.clock.now();
    this.host.scrollTo(view, 0);
    this.position = 0;
    this.commanded = 0;
    this.lastTick = now;
    this.endedAt = undefined;
    this.graceUntil = now + GRACE_MS;
    this.hopAt = now + this.between(settings.hopMinSeconds, settings.hopMaxSeconds) * 1000;
    this.cancelTick = this.clock.after(TICK_MS, () => this.tick(session));
  }

  private tick(session: number): void {
    if (session !== this.session || this.current !== 'roaming') return;
    const view = this.focus;
    if (!view) return;
    const geometry = this.host.geometry(view);
    if (!geometry) {
      this.noteActivity('other');
      return;
    }
    const settings = this.host.settings();
    const now = this.clock.now();
    const tolerance = Math.max(2, Math.ceil(settings.scrollLinesPerSecond * 0.4));
    if (now >= this.graceUntil && Math.abs(geometry.top - this.commanded) > tolerance) {
      this.noteActivity('editor');
      return;
    }
    if (now >= this.hopAt) {
      this.hop(session).catch((error: unknown) => this.fail(session, error));
      return;
    }
    const maxTop = Math.max(0, geometry.lineCount - geometry.visibleLines);
    const step = Math.min(now - this.lastTick, MAX_TICK_STEP_MS);
    this.lastTick = now;
    this.position += (settings.scrollLinesPerSecond * step) / 1000;
    const target = Math.floor(this.position);
    if (target >= maxTop) {
      if (this.commanded !== maxTop) {
        this.host.scrollTo(view, maxTop);
        this.commanded = maxTop;
      }
      this.endedAt ??= now;
      if (now - this.endedAt >= END_PAUSE_MS) {
        this.hop(session).catch((error: unknown) => this.fail(session, error));
        return;
      }
    } else if (target !== this.commanded) {
      this.host.scrollTo(view, target);
      this.commanded = target;
    }
    this.cancelTick = this.clock.after(TICK_MS, () => this.tick(session));
  }
}
