// 양형 계산 (양형기준 2025. 7. 1. 시행분 기준). phaser/DOM 비의존, 무작위 없음.
import { LEEWAY_RATIO, SUSPENSION_MAX_MONTHS } from './config';
import type { Factor, SuspFactor, Range, Scenario } from './scenario/schema';

export type Area = 'mitigated' | 'basic' | 'aggravated';
export type SentenceInput = { months: number; suspended: boolean };

/** 보유한 카드로 뒷받침되는 인자만 남긴다. */
export function availableFactors<T extends { requiresAnyCard: string[] }>(fs: T[], held: ReadonlySet<string>): T[] {
  return fs.filter((x) => x.requiresAnyCard.some((c) => held.has(c)));
}

const dirVal = (f: Factor) => (f.direction === 'aggravate' ? 1 : -1);
const areaOf = (n: number): Area | null => (n > 0 ? 'aggravated' : n < 0 ? 'mitigated' : null);

/** 행위 순차(행위자 인자 중 actEquivalent는 행위로 셈) → 행위자 순차 → basic. */
export function evaluateArea(special: Factor[]): { area: Area; judgmentCall: boolean } {
  let act = 0;
  let actor = 0;
  for (const f of special) {
    if (f.nature === 'act' || f.actEquivalent) act += dirVal(f);
    else actor += dirVal(f);
  }
  const byAct = areaOf(act);
  const byActor = areaOf(actor);
  const judgmentCall = act !== 0 && actor !== 0 && Math.sign(act) !== Math.sign(actor) && Math.abs(actor) > Math.abs(act);
  return { area: byAct ?? byActor ?? 'basic', judgmentCall };
}

export function recommendedRange(
  s: Scenario['sentencing'], special: Factor[],
): { area: Area; range: Range; adjusted: boolean; judgmentCall: boolean } {
  const { area, judgmentCall } = evaluateArea(special);
  const base = s.ranges[area];
  const net = special
    .filter((f) => f.tier === 'special')
    .reduce((n, f) => n + dirVal(f), 0);
  if (area === 'aggravated' && net >= 2) {
    return { area, range: { min: base.min, max: Math.round(base.max * 1.5) }, adjusted: true, judgmentCall };
  }
  if (area === 'mitigated' && net <= -2) {
    return { area, range: { min: Math.floor(base.min / 2), max: base.max }, adjusted: true, judgmentCall };
  }
  return { area, range: { min: base.min, max: base.max }, adjusted: false, judgmentCall };
}

export function suspensionRecommendation(fs: SuspFactor[]): 'suspend' | 'prison' | 'discretion' {
  const sign = (x: SuspFactor) => (x.direction === 'positive' ? 1 : -1);
  const d = fs.filter((x) => x.tier === 'major').reduce((n, x) => n + sign(x), 0);
  const g = fs.filter((x) => x.tier === 'general').reduce((n, x) => n + sign(x), 0);
  if (d >= 2) return -g > d ? 'discretion' : 'suspend';
  if (d <= -2) return g > -d ? 'discretion' : 'prison';
  return 'discretion';
}

/** 부기(addendum)가 있으면 허용 오차만큼 범위를 넓힌다. 경계값은 소수일 수 있다. */
export function leeway(range: Range, hasAddendum: boolean): Range {
  const r = hasAddendum ? LEEWAY_RATIO : 0;
  return { min: range.min * (1 - r), max: range.max * (1 + r) };
}

/** 넘어선 경계 대비 이탈 비율(%). */
export function deviationPercent(range: Range, months: number): { dir: 'above' | 'below' | null; pct: number } {
  if (months < range.min) return { dir: 'below', pct: ((range.min - months) / range.min) * 100 };
  if (months > range.max) return { dir: 'above', pct: ((months - range.max) / range.max) * 100 };
  return { dir: null, pct: 0 };
}

export function validateSentence(s: SentenceInput, statutoryMaxMonths: number): string | null {
  if (!Number.isInteger(s.months) || s.months < 1) return '형량은 1개월 이상의 정수여야 합니다';
  if (s.months > statutoryMaxMonths) return `법정형 상한(${statutoryMaxMonths}개월)을 넘습니다`;
  if (s.suspended && s.months > SUSPENSION_MAX_MONTHS) return `집행유예는 ${SUSPENSION_MAX_MONTHS / 12}년 이하의 형에만 가능합니다`;
  return null;
}
