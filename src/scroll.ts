export interface ScrollPlan {
  start: number;
  direction: 1 | -1;
}

export function planScroll(maxTop: number, pickStart: number, pickDirection: number): ScrollPlan {
  const last = Math.max(0, maxTop);
  const start = Math.min(last, Math.floor(pickStart * (last + 1)));
  const wanted = pickDirection < 0.5 ? 1 : -1;
  if (wanted === 1 && start >= last) return { start, direction: -1 };
  if (wanted === -1 && start <= 0) return { start, direction: 1 };
  return { start, direction: wanted };
}
