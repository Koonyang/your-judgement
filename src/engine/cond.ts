import type { Cond, Flag } from './scenario/schema';

export function evalCond(cond: Cond | undefined, flags: ReadonlySet<Flag>): boolean {
  if (!cond) return true;
  if (cond.all && !cond.all.every((f) => flags.has(f))) return false;
  if (cond.none && cond.none.some((f) => flags.has(f))) return false;
  return true;
}
