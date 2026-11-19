import {
  availableFactors, evaluateArea, recommendedRange, suspensionRecommendation,
  leeway, deviationPercent, validateSentence,
} from '../../src/engine/sentencing';
import type { Factor, SuspFactor, Scenario } from '../../src/engine/scenario/schema';

const ranges = {
  mitigated: { min: 4, max: 10 }, basic: { min: 6, max: 18 }, aggravated: { min: 10, max: 24 },
};
const s = { ranges } as unknown as Scenario['sentencing'];
const f = (nature: 'act' | 'actor', direction: 'mitigate' | 'aggravate', actEquivalent?: boolean): Factor => ({
  id: `${nature}-${direction}-${Math.random()}`, name: 'x', tier: 'special', nature, direction,
  actEquivalent, requiresAnyCard: [], weight: 1,
});
const sf = (tier: 'major' | 'general', direction: 'positive' | 'negative'): SuspFactor => ({
  id: 'x', name: 'x', tier, direction, requiresAnyCard: [],
});
const many = (n: number, mk: () => SuspFactor) => Array.from({ length: n }, mk);

describe('availableFactors', () => {
  it('보유 카드가 하나라도 있는 인자만', () => {
    const fs = [{ requiresAnyCard: ['a'] }, { requiresAnyCard: ['b', 'c'] }, { requiresAnyCard: [] }];
    expect(availableFactors(fs, new Set(['c']))).toEqual([fs[1]]);
  });
});

describe('recommendedRange', () => {
  it('인자 없음 → basic', () => {
    expect(recommendedRange(s, [])).toMatchObject({ area: 'basic', range: { min: 6, max: 18 }, adjusted: false });
  });
  it('생계형만 → mitigated 비조정', () => {
    expect(recommendedRange(s, [f('act', 'mitigate')])).toMatchObject({
      area: 'mitigated', range: { min: 4, max: 10 }, adjusted: false });
  });
  it('생계형 + 처벌불원(actEquivalent) → 특별조정', () => {
    expect(recommendedRange(s, [f('act', 'mitigate'), f('actor', 'mitigate', true)])).toMatchObject({
      area: 'mitigated', range: { min: 2, max: 10 }, adjusted: true });
  });
  it('가중 대칭 조정', () => {
    expect(recommendedRange(s, [f('act', 'aggravate'), f('act', 'aggravate')])).toMatchObject({
      area: 'aggravated', range: { min: 10, max: 36 }, adjusted: true });
  });
});

describe('evaluateArea', () => {
  it('행위 감경 1 + 행위자 가중 2 → mitigated, 종합 판단', () => {
    expect(evaluateArea([f('act', 'mitigate'), f('actor', 'aggravate'), f('actor', 'aggravate')]))
      .toEqual({ area: 'mitigated', judgmentCall: true });
  });
  it('행위 0이면 행위자로', () => {
    expect(evaluateArea([f('actor', 'aggravate')])).toEqual({ area: 'aggravated', judgmentCall: false });
  });
});

describe('suspensionRecommendation', () => {
  it('주요긍정2·부정1 → discretion', () => {
    expect(suspensionRecommendation([...many(2, () => sf('major', 'positive')), sf('major', 'negative')])).toBe('discretion');
  });
  it('주요긍정2 → suspend', () => {
    expect(suspensionRecommendation(many(2, () => sf('major', 'positive')))).toBe('suspend');
  });
  it('주요긍정2·일반부정3 → discretion', () => {
    expect(suspensionRecommendation([...many(2, () => sf('major', 'positive')), ...many(3, () => sf('general', 'negative'))])).toBe('discretion');
  });
  it('주요부정2 → prison', () => {
    expect(suspensionRecommendation(many(2, () => sf('major', 'negative')))).toBe('prison');
  });
});

describe('leeway', () => {
  it('부기 있으면 확장', () => {
    const r = leeway({ min: 4, max: 10 }, true);
    expect(r.min).toBeCloseTo(3.2); expect(r.max).toBeCloseTo(12);
  });
  it('부기 없으면 그대로', () => {
    expect(leeway({ min: 4, max: 10 }, false)).toEqual({ min: 4, max: 10 });
  });
});

describe('deviationPercent', () => {
  it('아래/위/안', () => {
    expect(deviationPercent({ min: 2, max: 10 }, 1)).toEqual({ dir: 'below', pct: 50 });
    expect(deviationPercent({ min: 2, max: 10 }, 15)).toEqual({ dir: 'above', pct: 50 });
    expect(deviationPercent({ min: 2, max: 10 }, 5)).toEqual({ dir: null, pct: 0 });
  });
});

describe('validateSentence', () => {
  const msg = '형량은 1개월 이상의 정수여야 합니다';
  it('오류들', () => {
    expect(validateSentence({ months: 0, suspended: false }, 72)).toBe(msg);
    expect(validateSentence({ months: 6.5, suspended: false }, 72)).toBe(msg);
    expect(validateSentence({ months: 73, suspended: false }, 72)).toBe('법정형 상한(72개월)을 넘습니다');
    expect(validateSentence({ months: 40, suspended: true }, 72)).toBe('집행유예는 3년 이하의 형에만 가능합니다');
  });
  it('정상', () => {
    expect(validateSentence({ months: 6, suspended: true }, 72)).toBeNull();
  });
});
