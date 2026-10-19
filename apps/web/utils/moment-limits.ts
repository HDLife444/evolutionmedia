// In-memory bounds apply per running server instance, not across Vercel's fleet.
// No listener text, cookies, raw addresses, or query results are retained here.
export function createMomentLimits(now = Date.now) {
  let windowStart = now();
  let total = 0;
  let active = 0;
  const visitors = new Map<string, number>();
  return {
    enter(visitor: string): (() => void) | null {
      if (now() - windowStart >= 60_000) { windowStart = now(); total = 0; visitors.clear(); }
      if (active >= 3 || total >= 30 || (visitors.get(visitor) ?? 0) >= 6) return null;
      total++; active++; visitors.set(visitor, (visitors.get(visitor) ?? 0) + 1);
      let released = false;
      return () => { if (!released) { active--; released = true; } };
    },
  };
}
