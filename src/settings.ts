export interface RoamSettings {
  enabled: boolean;
  idleSeconds: number;
  hopMinSeconds: number;
  hopMaxSeconds: number;
  scrollLinesPerSecond: number;
  maxRoamTabs: number;
  maxFileSizeKb: number;
  exclude: readonly string[];
}

export type RawSettings = { [K in keyof RoamSettings]?: unknown };

export const DEFAULT_EXCLUDE: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.hg/**',
  '**/.svn/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/target/**',
  '**/vendor/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
];

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeSettings(raw: RawSettings): RoamSettings {
  const hopMin = bounded(raw.hopMinSeconds, 8, 2, 600);
  const hopMax = bounded(raw.hopMaxSeconds, 25, 2, 600);
  const exclude = Array.isArray(raw.exclude)
    ? raw.exclude.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.length > 0)
    : DEFAULT_EXCLUDE;
  return {
    enabled: raw.enabled !== false,
    idleSeconds: bounded(raw.idleSeconds, 60, 5, 3600),
    hopMinSeconds: hopMin,
    hopMaxSeconds: Math.max(hopMin, hopMax),
    scrollLinesPerSecond: bounded(raw.scrollLinesPerSecond, 6, 1, 60),
    maxRoamTabs: Math.round(bounded(raw.maxRoamTabs, 4, 1, 10)),
    maxFileSizeKb: Math.round(bounded(raw.maxFileSizeKb, 512, 1, 20480)),
    exclude,
  };
}
