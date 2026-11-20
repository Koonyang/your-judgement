import { reviewAppeal, whoAppeals } from '../../src/engine/appeal';
import { toRecordEntry } from '../../src/engine/record';
import { initialState, type GameState } from '../../src/engine/state';
import type { Scenario } from '../../src/engine/scenario/schema';

const f = (id: string, tier: 'special' | 'general', nature: 'act' | 'actor', direction: 'mitigate' | 'aggravate', card: string, weight: number, actEquivalent?: boolean) =>
  ({ id, name: id, tier, nature, direction, requiresAnyCard: [card], weight, ...(actEquivalent ? { actEquivalent } : {}) });

// ep01과 비슷한 양형 값
const sc = {
  meta: { id: 'ep01', title: '편의점 도시락', court: 'single', biasType: 'none', truthMemo: '', tutorial: true },
  cells: [
    { id: 'c_act', name: '절취', disputed: false },
    { id: 'c_intent', name: '고의', disputed: false },
  ],
  cards: [
    { id: 'c_conf', title: '자백', text: '', kind: 'evidence', confession: true },
    { id: 'c_cctv', title: 'CCTV', text: '', kind: 'evidence' },
    { id: 'c_livelihood', title: '생계형', text: '', kind: 'fact' },
    { id: 'c_nonpunish', title: '처벌불원', text: '', kind: 'evidence' },
    { id: 'c_prior', title: '동종 전과', text: '', kind: 'evidence' },
  ],
  opening: [],
  exams: [],
  closing: { demandMonths: 12, lines: [] },
  appealView: [
    { cellId: 'c_act', proven: true },
    { cellId: 'c_intent', proven: true },
  ],
  sentencing: {
    guidelineName: '일반절도',
    statutoryMaxMonths: 72,
    ranges: { mitigated: { min: 4, max: 10 }, basic: { min: 6, max: 18 }, aggravated: { min: 10, max: 24 } },
    factors: [
      f('f_livelihood', 'special', 'act', 'mitigate', 'c_livelihood', 30),
      f('f_nonpunish', 'special', 'actor', 'mitigate', 'c_nonpunish', 30, true),
      f('f_aggr', 'special', 'act', 'aggravate', 'c_aggr', 20),
      f('f_remorse', 'general', 'actor', 'mitigate', 'c_remorse', 30),
      f('f_prior', 'general', 'actor', 'aggravate', 'c_prior', 30),
      f('f_heavy', 'general', 'act', 'aggravate', 'c_heavy', 15),
      f('f_minor', 'general', 'act', 'aggravate', 'c_minor', 10),
    ],
    suspensionFactors: [
      { id: 's_livelihood', name: '생계형', tier: 'major', direction: 'positive', requiresAnyCard: ['c_livelihood'] },
      { id: 's_nonpunish', name: '처벌불원', tier: 'major', direction: 'positive', requiresAnyCard: ['c_nonpunish'] },
      { id: 's_prior', name: '동종 전과', tier: 'major', direction: 'negative', requiresAnyCard: ['c_prior'] },
      { id: 's_prior2', name: '동종 전과2', tier: 'major', direction: 'negative', requiresAnyCard: ['c_prior2'] },
    ],
    suspensionDeviation: 30,
  },
  appeal: { defendant: { ifImprisoned: true, ifConvictedWhileDenying: true }, denies: false },
} as unknown as Scenario;

const BASE_HELD = ['c_conf', 'c_cctv', 'c_livelihood', 'c_nonpunish', 'c_prior'];

function guilty(months: number, suspended: boolean, held: string[] = BASE_HELD): GameState {
  const s = initialState(sc);
  s.heldCards = [...held];
  s.board.c_act = { cards: ['c_cctv', 'c_conf'], mark: 'proven' };
  s.board.c_intent = { cards: ['c_conf'], mark: 'proven' };
  s.sentencing = { ...s.sentencing, months, suspended };
  return s;
}

describe('whoAppeals', () => {
  it('검사: 구형 1/2 미만이면 항소, 같으면 안 함', () => {
    expect(whoAppeals(sc, guilty(5, true)).prosecutor).toBe(true);
    expect(whoAppeals(sc, guilty(6, true)).prosecutor).toBe(false);
  });
  it('검사: 무죄면 항소', () => {
    const s = guilty(6, true);
    s.board.c_intent.mark = 'doubt';
    expect(whoAppeals(sc, s)).toEqual({ prosecutor: true, defendant: false });
  });
  it('피고인: 실형이면 항소, 집유면 안 함', () => {
    expect(whoAppeals(sc, guilty(8, false)).defendant).toBe(true);
    expect(whoAppeals(sc, guilty(8, true)).defendant).toBe(false);
  });
  it('피고인: 부인 사건 유죄면 항소', () => {
    const sc2 = { ...sc, appeal: { defendant: { ifImprisoned: false, ifConvictedWhileDenying: true }, denies: true } } as Scenario;
    expect(whoAppeals(sc2, guilty(8, true)).defendant).toBe(true);
    const s = guilty(8, true);
    s.board.c_intent.mark = 'doubt';
    expect(whoAppeals(sc2, s).defendant).toBe(false);
  });
});

describe('reviewAppeal', () => {
  it('6월 집유, 위반 없음 → final, hypothetical 없음', () => {
    const o = reviewAppeal(sc, guilty(6, true));
    expect(o.appellants).toEqual({ prosecutor: false, defendant: false });
    expect(o.result).toBe('final');
    expect(o.reasons).toEqual([]);
    expect(o.newSentence).toBeNull();
    expect(o.hypothetical).toEqual([]);
  });

  it('5월 집유 → 검사 항소, 범위 2~10 안 → dismissed', () => {
    const o = reviewAppeal(sc, guilty(5, true));
    expect(o.appellants.prosecutor).toBe(true);
    expect(o.result).toBe('dismissed');
    expect(o.reasons).toEqual([]);
    expect(o.newSentence).toBeNull();
  });

  it('8월 실형 → 피고인 항소, dismissed', () => {
    const o = reviewAppeal(sc, guilty(8, false));
    expect(o.appellants).toEqual({ prosecutor: false, defendant: true });
    expect(o.result).toBe('dismissed');
  });

  it('1월(범위 2~10, 근거 0) → 검사 항소, sentencing 파기, 2월', () => {
    const o = reviewAppeal(sc, guilty(1, true));
    expect(o.appellants.prosecutor).toBe(true);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toEqual(['sentencing']);
    expect(o.newSentence).toEqual({ verdict: 'guilty', months: 2, suspended: true });
  });

  it('여유폭은 원심 [추가로] 여부로 정한다', () => {
    // 범위 2~10, 여유폭 1.6~12. 11월은 여유폭 안 → 유지
    const s = guilty(11, false);
    s.judgment.addendum = '덧붙임';
    expect(reviewAppeal(sc, s).result).toBe('dismissed');
    s.judgment.addendum = '';
    expect(reviewAppeal(sc, s).result).toBe('reversed');
  });

  it('정당 신문 제지(affectsJudgment, 처벌불원 상실), 6월 집유 → final, hypothetical 있음', () => {
    const s = guilty(6, true, BASE_HELD.filter((c) => c !== 'c_nonpunish'));
    s.violations = [{ id: 'v1', text: '정당한 신문 제지', affectsJudgment: true, lostCards: ['c_nonpunish'] }];
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('final');
    expect(o.reasons).toEqual([]);
    expect(o.remarks).toEqual([]);
    expect(o.hypothetical.length).toBeGreaterThanOrEqual(1);
  });

  it('튜토리얼이 아니면 final의 hypothetical은 비어 있다', () => {
    const sc2 = { ...sc, meta: { ...sc.meta, tutorial: false } } as Scenario;
    const s = guilty(6, true);
    s.violations = [{ id: 'v1', text: '정당한 신문 제지', affectsJudgment: true, lostCards: [] }];
    expect(reviewAppeal(sc2, s).hypothetical).toEqual([]);
  });

  it('절차 위반 파기: 잃은 카드를 복원해 범위를 다시 계산한다', () => {
    // 처벌불원 상실 상태에서 원심 범위는 4~10. 3월 집유 → 검사 항소.
    // 복원하면 2~10 → 형량은 범위 안이지만 절차 파기로 자판(3월 유지)
    const s = guilty(3, true, BASE_HELD.filter((c) => c !== 'c_nonpunish'));
    s.violations = [{ id: 'v1', text: '정당한 신문 제지', affectsJudgment: true, lostCards: ['c_nonpunish'] }];
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toEqual(['procedure']);
    expect(o.newSentence).toEqual({ verdict: 'guilty', months: 3, suspended: true });
  });

  it('판결 영향 없는 위반은 remarks', () => {
    const s = guilty(5, true);
    s.violations = [{ id: 'v2', text: '피고인 신문 제지', affectsJudgment: false, lostCards: ['c_remorse'] }];
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('dismissed');
    expect(o.remarks).toHaveLength(1);
  });

  it('무죄 + appealView proven → fact 파기, 유죄 자판(하한, 집유)', () => {
    const s = guilty(6, true);
    s.sentencing.months = null;
    s.board.c_intent.mark = 'doubt';
    const o = reviewAppeal(sc, s);
    expect(o.appellants.prosecutor).toBe(true);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toContain('fact');
    expect(o.newSentence).toEqual({ verdict: 'guilty', months: 2, suspended: true });
  });

  it('무죄 + appealView도 의심 → dismissed', () => {
    const sc2 = { ...sc, appealView: [{ cellId: 'c_act', proven: true }, { cellId: 'c_intent', proven: false }] } as Scenario;
    const s = guilty(6, true);
    s.sentencing.months = null;
    s.board.c_intent.mark = 'doubt';
    expect(reviewAppeal(sc2, s).result).toBe('dismissed');
  });

  it('증거 없이 증명됨 → fact 파기, 자백만 → law 파기', () => {
    const s = guilty(5, true);
    s.board.c_intent.cards = [];
    expect(reviewAppeal(sc, s).reasons.map((r) => r.code)).toEqual(['fact']);
    const t = guilty(5, true);
    t.board.c_act.cards = ['c_conf'];
    expect(reviewAppeal(sc, t).reasons.map((r) => r.code)).toEqual(['law']);
  });

  it('R7: 자백만으로 유죄 + appealView 전부 증명 → law 파기, 유죄 자판', () => {
    const s = guilty(5, true);
    s.board.c_act.cards = ['c_conf'];
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toEqual(['law']);
    expect(o.newSentence).toEqual({ verdict: 'guilty', months: 5, suspended: true });
  });

  it('R7: 자백만으로 유죄 + appealView 한 칸 의심 → law 파기, 무죄 자판', () => {
    const sc2 = { ...sc, appealView: [{ cellId: 'c_act', proven: true }, { cellId: 'c_intent', proven: false }] } as Scenario;
    const s = guilty(5, true);
    s.board.c_act.cards = ['c_conf'];
    const o = reviewAppeal(sc2, s);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toEqual(['law']);
    expect(o.newSentence).toEqual({ verdict: 'acquitted', months: null, suspended: false });
  });

  it('R7: when이 맞지 않는 의심 판단은 무시한다', () => {
    const sc2 = { ...sc, appealView: [
      { cellId: 'c_act', proven: true }, { cellId: 'c_intent', proven: true },
      { cellId: 'c_intent', proven: false, when: { all: ['flag_x'] } },
    ] } as Scenario;
    const s = guilty(5, true);
    s.board.c_intent.cards = [];
    expect(reviewAppeal(sc2, s).newSentence?.verdict).toBe('guilty');
    s.flags = ['flag_x'];
    expect(reviewAppeal(sc2, s).newSentence?.verdict).toBe('acquitted');
  });

  it('불이익변경금지: 피고인만 항소, 자판이 더 무거우면 dismissed', () => {
    // 가중 특별인자 → 범위 10~24. 7월 실형 → 피고인만 항소. 파기 시 10월이 되지만 증형 불가
    const s = guilty(7, false, ['c_conf', 'c_cctv', 'c_aggr']);
    const o = reviewAppeal(sc, s);
    expect(o.appellants).toEqual({ prosecutor: false, defendant: true });
    expect(o.result).toBe('dismissed');
    expect(o.reasons).toEqual([]);
    expect(o.newSentence).toBeNull();
  });

  it('집유 권고 반대(실형 권고인데 집유) + 근거 0 → 파기, 실형 자판', () => {
    // 주요부정 2 → 실형 권고. 특별인자 없음 → 기본 6~18. 5월 집유 → 검사 항소
    const s = guilty(5, true, ['c_conf', 'c_cctv', 'c_prior', 'c_prior2']);
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('reversed');
    expect(o.reasons.map((r) => r.code)).toEqual(['sentencing']);
    expect(o.newSentence).toEqual({ verdict: 'guilty', months: 6, suspended: false });
  });

  it('집유 권고 반대여도 근거 무게 ≥ suspensionDeviation이면 유지', () => {
    // 6월 집유(범위 안), 실형 권고 반대. 이탈 방향 = 감경 → f_remorse 30 ≥ 30
    const s = guilty(6, true, ['c_conf', 'c_cctv', 'c_prior', 'c_prior2', 'c_remorse']);
    // 검사 항소를 일으키려고 시나리오 구형을 올린다
    const sc2 = { ...sc, closing: { demandMonths: 18, lines: [] } } as Scenario;
    s.judgment.deviationSlots = ['f_remorse'];
    expect(reviewAppeal(sc2, s).result).toBe('dismissed');
    s.judgment.deviationSlots = [];
    expect(reviewAppeal(sc2, s).result).toBe('reversed');
  });

  describe('이탈 슬롯 (범위 4~10, 15월 실형 → 이탈 50%)', () => {
    const held = ['c_conf', 'c_cctv', 'c_livelihood', 'c_prior', 'c_heavy', 'c_minor'];
    it('30+15 → 파기, 10월로 감형', () => {
      const s = guilty(15, false, held);
      s.judgment.deviationSlots = ['f_prior', 'f_heavy'];
      const o = reviewAppeal(sc, s);
      expect(o.appellants).toEqual({ prosecutor: false, defendant: true });
      expect(o.result).toBe('reversed');
      expect(o.newSentence).toEqual({ verdict: 'guilty', months: 10, suspended: false });
    });
    it('30+15+10 → 유지', () => {
      const s = guilty(15, false, held);
      s.judgment.deviationSlots = ['f_prior', 'f_heavy', 'f_minor'];
      expect(reviewAppeal(sc, s).result).toBe('dismissed');
    });
    it('방향이 반대인 인자는 0', () => {
      const s = guilty(15, false, held);
      s.judgment.deviationSlots = ['f_prior', 'f_heavy', 'f_livelihood'];
      expect(reviewAppeal(sc, s).result).toBe('reversed');
    });
  });

  it('원심 영역 결정에 쓴 특별인자는 무게 × 0.5 (30 → 15)', () => {
    // 범위 4~10, 2월 집유 → 이탈 50%. f_livelihood(30) + f_remorse(30)
    const held = ['c_conf', 'c_cctv', 'c_livelihood', 'c_remorse'];
    const s = guilty(2, true, held);
    s.judgment.deviationSlots = ['f_livelihood', 'f_remorse'];
    s.sentencing.special = ['f_livelihood'];
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('reversed'); // 15 + 30 = 45 < 50
    expect(o.newSentence?.months).toBe(4);
  });

  it('R11: 감쇠 대상은 체크 여부가 아니라 기록상 영역 결정에 쓰인 특별인자다', () => {
    const held = ['c_conf', 'c_cctv', 'c_livelihood', 'c_remorse'];
    const s = guilty(2, true, held);
    s.judgment.deviationSlots = ['f_livelihood', 'f_remorse'];
    s.sentencing.special = []; // 체크하지 않아도 f_livelihood는 기록상 영역을 정했다
    const o = reviewAppeal(sc, s);
    expect(o.result).toBe('reversed'); // 15 + 30 = 45 < 50
    expect(o.newSentence?.months).toBe(4);
    // 기록에 근거 카드가 없는 특별인자는 영역 결정에 쓰이지 않았으므로 감쇠하지 않는다.
    const s2 = guilty(3, true, ['c_conf', 'c_cctv', 'c_remorse']); // 범위 6~18, 3월 → 이탈 50%
    s2.judgment.deviationSlots = ['f_livelihood', 'f_remorse'];
    s2.sentencing.special = ['f_livelihood'];
    expect(reviewAppeal(sc, s2).result).toBe('dismissed'); // 30 + 30 = 60 ≥ 50 (감쇠했다면 45 → 파기)
  });
});

describe('toRecordEntry', () => {
  it('사건 정보·판결·결과·지적', () => {
    const s = guilty(1, true);
    s.violations = [{ id: 'v2', text: '경미한 지적', affectsJudgment: false, lostCards: [] }];
    const o = reviewAppeal(sc, s);
    const r = toRecordEntry(sc, s, o);
    expect(r.caseId).toBe('ep01');
    expect(r.title).toBe('편의점 도시락');
    expect(r.verdict).toBe('유죄');
    expect(r.sentence).toContain('징역 1월');
    expect(r.sentence).toContain('집행유예');
    expect(r.result).toBe('reversed');
    expect(r.remarks.length).toBeGreaterThanOrEqual(2);
  });
  it('무죄면 sentence 빈 문자열', () => {
    const s = guilty(6, true);
    s.sentencing.months = null;
    s.board.c_intent.mark = 'doubt';
    const r = toRecordEntry(sc, s, reviewAppeal(sc, s));
    expect(r.verdict).toBe('무죄');
    expect(r.sentence).toBe('');
  });
});
