// 1화 대표 플레이 경로를 엔진만으로 끝까지 돌려 기대 결과를 확인한다 (설계 문서 8절).
import { verdictOf } from '../../src/engine/board';
import raw from '../../data/scenarios/ep01.json';
import { reviewAppeal } from '../../src/engine/appeal';
import { currentLine, reduce } from '../../src/engine/reducer';
import { loadScenario } from '../../src/engine/scenario/load';
import { availableFactors, recommendedRange, suspensionRecommendation } from '../../src/engine/sentencing';
import type { Action, GameState } from '../../src/engine/state';
import { adv, play, to, toPhase, toSupp, type Step } from './play';

const sc = loadScenario(raw);

type Choices = {
  legit: 'hear' | 'cut';
  insult: 'stop' | 'ignore';
  grill: 'hear' | 'cut';
  /** 칸 → 기물(카드) → 판사의 판정. 판결 단계에 들어선 뒤 내린다. */
  board: Record<string, Record<string, 'ok' | 'reject'>>;
  /** null이면 무죄라 양형 단계 없음 */
  sentence: { months: number; suspended: boolean } | null;
};

const CELLS = ['corroboration'];
/** 1화는 다툼 없는 자백 사건: 폰 한 칸(자백의 보강). CCTV를 인정하면 막힌다. */
const fullBoard: Choices['board'] = { corroboration: { c_cctv: 'ok' } };
const ALL_PIECES = ['c_confession', 'c_cctv', 'c_receipt', 'c_owner_stmt', 'c_owner_testimony', 'c_def_testimony'];
const base: Choices = {
  legit: 'hear', insult: 'stop', grill: 'hear', board: fullBoard, sentence: { months: 6, suspended: true },
};

/** 개정 전 ~ 증인 점주 Exam 시작 */
const toOwner: Step[] = [to('owner_1')];

function actions(c: Choices): Step[] {
  const a: Step[] = [...toOwner];
  // 점주: 선서·주신문 → 여죄 질문 이의 인용 → 반대신문
  a.push(to('owner_9'), { type: 'RULE_OBJECTION', ruling: 'sustain' }, to('owner_13'));
  a.push(c.legit === 'hear' ? to('owner_16') : { type: 'INTERRUPT' });
  if (c.insult === 'stop') a.push({ type: 'INTERRUPT' });
  a.push(toSupp(), { type: 'ASK_SUPP', questionId: 'q_owner_items' }, { type: 'END_SUPP' });
  // 피고인: 검사 추궁 → 변호인 생활 사정
  a.push(to('def_2'));
  if (c.grill === 'cut') a.push({ type: 'INTERRUPT' });
  a.push(toSupp(), { type: 'ASK_SUPP', questionId: 'q_def_meal' }, { type: 'END_SUPP' });
  // 결심 → 재검토 → 판단
  a.push(toPhase('verdict'));
  for (const [cellId, v] of Object.entries(c.board))
    for (const [cardId, verdict] of Object.entries(v)) a.push({ type: 'JUDGE_PIECE', cellId, cardId, verdict });
  a.push({ type: 'CONFIRM_VERDICT' });
  if (c.sentence) a.push({ type: 'SET_SENTENCING', patch: c.sentence }, { type: 'CONFIRM_SENTENCING' });
  a.push({ type: 'CONFIRM_JUDGMENT' }, { type: 'FINISH_PRONOUNCE' });
  return a;
}

function run(over: Partial<Choices> = {}): { s: GameState; out: ReturnType<typeof reviewAppeal> } {
  const s = play(sc, actions({ ...base, ...over }));
  expect(s.phase).toBe('appeal');
  return { s, out: reviewAppeal(sc, s) };
}

const held = (s: GameState) => new Set(s.heldCards);
const rangeOf = (s: GameState) =>
  recommendedRange(sc.sentencing, availableFactors(sc.sentencing.factors, held(s)).filter((f) => f.tier === 'special')).range;
const suspRec = (s: GameState) => suspensionRecommendation(availableFactors(sc.sentencing.suspensionFactors, held(s)));

describe('1화 데이터', () => {
  it('스키마 검증을 통과하고 필수 id가 있다', () => {
    expect(sc.meta.tutorial).toBe(true);
    expect(sc.cells.map((c) => c.id)).toEqual(CELLS);
    expect(sc.cells.every((c) => !c.disputed)).toBe(true);
    expect(sc.cards.map((c) => c.id).sort()).toEqual([
      'c_cctv', 'c_confession', 'c_def_testimony', 'c_livelihood', 'c_minor', 'c_nonpunish', 'c_owner_stmt',
      'c_owner_testimony', 'c_receipt', 'c_record', 'c_remorse', 'c_repaid', 'm_count', 'm_time',
    ]);
    expect(sc.cards.find((c) => c.id === 'c_confession')?.confession).toBe(true);
    expect(sc.sentencing.factors.map((f) => [f.id, f.tier, f.requiresAnyCard, f.weight])).toEqual([
      ['f_livelihood', 'special', ['c_livelihood'], 30],
      ['f_nonpunish', 'special', ['c_nonpunish'], 30],
      ['f_remorse', 'general', ['c_remorse'], 10],
      ['f_recovery', 'general', ['c_repaid'], 10],
      ['f_prior', 'general', ['c_record'], 10],
    ]);
    expect(sc.sentencing.suspensionFactors.map((f) => f.id)).toEqual([
      's_livelihood', 's_nonpunish', 's_prior', 's_minor', 's_remorse', 's_recovery',
    ]);
    expect(sc.sentencing.statutoryMaxMonths).toBe(72);
    expect(sc.closing.demandMonths).toBe(12);
    expect(sc.sentencing.suspensionDeviation).toBe(30);
    expect(sc.appealView.map((v) => [v.cellId, v.proven])).toEqual(CELLS.map((id) => [id, true]));
  });

  it('증거신청 요구는 마이크로 해야 넘어간다(필수 발언)', () => {
    const s = play(sc, [to('open_9')]);
    expect(reduce(sc, s, { type: 'ADVANCE' })).toBe(s);
    expect(reduce(sc, s, { type: 'SPEAK', speakId: 'nope' })).toBe(s);
    expect(currentLine(sc, reduce(sc, s, { type: 'SPEAK', speakId: 'ask_evidence' }))?.id).toBe('open_10');
  });

  it('부동의 점주 진술조서는 점주 증언 뒤에 해금된다', () => {
    const atEvidence = play(sc, [toPhase('evidence')]);
    expect(atEvidence.phase).toBe('evidence');
    expect(atEvidence.unlockedEvidence).not.toContain('e_owner_stmt');
    expect(atEvidence.heldCards).toEqual(expect.arrayContaining(['c_confession', 'c_nonpunish', 'c_livelihood']));
    const { s } = run();
    expect(s.unlockedEvidence).toContain('e_owner_stmt');
  });

  it('여죄 질문을 기각하면 판결 영향 없는 위반 1건', () => {
    const s = play(sc, [...toOwner, to('owner_9'), { type: 'RULE_OBJECTION', ruling: 'overrule' }]);
    expect(s.violations).toHaveLength(1);
    expect(s.violations[0].affectsJudgment).toBe(false);
  });
});

describe('1화 경로', () => {
  it('정석: 범위 2~10월, 집유 종합 판단, 6월 집유 확정, 지적 없음', () => {
    const { s, out } = run();
    expect(s.violations).toEqual([]);
    expect(held(s)).toEqual(new Set([
      'c_confession', 'c_cctv', 'c_receipt', 'c_record', 'c_nonpunish', 'c_livelihood',
      'c_minor', 'c_repaid', 'c_owner_stmt', 'c_remorse', 'c_owner_testimony', 'c_def_testimony',
    ]));
    expect(rangeOf(s)).toEqual({ min: 2, max: 10 });
    expect(suspRec(s)).toBe('discretion');
    expect(out.result).toBe('final');
    expect(out.hypothetical).toEqual([]);
  });

  it('정당 대목 제지: 처벌불원 상실, 범위 4~10월, 확정되지만 가정 지적', () => {
    const { s, out } = run({ legit: 'cut' });
    expect(s.heldCards).not.toContain('c_nonpunish');
    expect(s.heldCards).not.toContain('c_repaid');
    expect(s.violations.map((v) => v.affectsJudgment)).toEqual([true]);
    expect(rangeOf(s)).toEqual({ min: 4, max: 10 });
    expect(suspRec(s)).toBe('discretion');
    expect(out.result).toBe('final');
    expect(out.hypothetical.length).toBeGreaterThanOrEqual(1);
  });

  it('모욕 방치: 처벌불원 철회, 변제는 남음, 8월 실형 → 피고인 항소 기각', () => {
    const { s, out } = run({ insult: 'ignore', sentence: { months: 8, suspended: false } });
    expect(s.flags).toContain('nonpunish_withdrawn');
    expect(s.heldCards).not.toContain('c_nonpunish');
    expect(s.heldCards).toContain('c_repaid');
    expect(rangeOf(s)).toEqual({ min: 4, max: 10 });
    expect(out.appellants).toEqual({ prosecutor: false, defendant: true });
    expect(out.result).toBe('dismissed');
  });

  it('정당 대목 제지 + 모욕 방치: 처벌불원 없음, 범위 4~10월, 끝까지 진행', () => {
    const { s, out } = run({ legit: 'cut', insult: 'ignore' });
    expect(s.heldCards).not.toContain('c_nonpunish');
    expect(s.heldCards).not.toContain('c_repaid');
    expect(s.flags).toContain('nonpunish_withdrawn');
    expect(s.violations.map((v) => v.id)).toEqual(['v_cut_repaid']);
    expect(rangeOf(s)).toEqual({ min: 4, max: 10 });
    expect(out.result).toBe('final');
  });

  it('R9: 정당 대목 제지 + 모욕 방치, 2월 집유 → 검사 항소, 철회된 처벌불원은 복원하지 않아 4월로 파기자판', () => {
    const { s, out } = run({ legit: 'cut', insult: 'ignore', sentence: { months: 2, suspended: true } });
    expect(s.heard).toContain('owner_17'); // 처벌불원 철회 진술을 들었다
    expect(out.appellants).toEqual({ prosecutor: true, defendant: false }); // 2 < 12 × 1/2
    expect(rangeOf(s)).toEqual({ min: 4, max: 10 });
    expect(out.result).toBe('reversed');
    expect(out.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['procedure', 'sentencing']));
    expect(out.newSentence?.months).toBe(4);
  });

  it('공판조서 기록(heard): 이의 인용·제지로 듣지 않은 진술은 없다', () => {
    const { s } = run({ legit: 'cut', grill: 'cut' });
    expect(s.heard).not.toContain('owner_10'); // 이의 인용으로 막은 여죄 답변
    expect(s.heard).not.toContain('owner_14');
    expect(s.heard).not.toContain('owner_15');
    for (const id of ['def_3', 'def_4', 'def_5']) expect(s.heard).not.toContain(id);
    expect(s.heard).toEqual(expect.arrayContaining(['q_owner_items', 'q_def_meal']));
    expect(new Set(s.heard).size).toBe(s.heard.length);
  });

  it('검사 추궁 제지: 반성 카드 없음, 판결 영향 없는 위반 1건', () => {
    const { s, out } = run({ grill: 'cut' });
    expect(s.flags).toContain('cut_prosecutor');
    expect(s.heldCards).not.toContain('c_remorse');
    expect(s.violations).toHaveLength(1);
    expect(s.violations[0].affectsJudgment).toBe(false);
    expect(out.result).toBe('final');
  });

  it('무죄(기물을 다 인정 못 함): 검사 항소, 사실오인 파기, 유죄 자판', () => {
    const { s, out } = run({
      board: { corroboration: Object.fromEntries(ALL_PIECES.map((id) => [id, 'reject' as const])) },
      sentence: null,
    });
    expect(s.sentencing.months).toBeNull();
    expect(out.appellants.prosecutor).toBe(true);
    expect(out.result).toBe('reversed');
    expect(out.reasons.map((r) => r.code)).toContain('fact');
    expect(out.newSentence?.verdict).toBe('guilty');
  });

  it('보강법칙: 자백만 다시 인정해도 유죄가 되지 않는다(무죄)', () => {
    const { s } = run({ board: { corroboration: { c_confession: 'ok' } }, sentence: null });
    expect(verdictOf(s.board, sc.cards)).toBe('acquitted');
    expect(s.sentencing.months).toBeNull();
  });

  it('결심 최후진술은 검사 추궁을 들었는지에 따라 갈린다', () => {
    const lastWords = (grill: 'hear' | 'cut') => {
      const a = actions({ ...base, grill });
      const toClosing = a.findIndex((x) => 'to' in x && x.to === 'phase:verdict');
      const s = play(sc, [...a.slice(0, toClosing), to('close_4'), ...adv(1)]);
      return currentLine(sc, s);
    };
    expect(lastWords('hear')?.yieldsCards).toEqual(['c_remorse']);
    expect(lastWords('cut')?.yieldsCards ?? []).toEqual([]);
    expect(lastWords('cut')?.speaker).toBe('defendant');
  });
});

describe('1화 쟁점 보드 v2', () => {
  const toReview = (): Step[] => {
    const a = actions(base);
    return a.slice(0, a.findIndex((x) => 'to' in x && x.to === 'phase:verdict')).concat(toPhase('review'));
  };

  it('검사의 증거는 입증취지대로 폰 앞 칸에 자동으로 올라온다', () => {
    const s = play(sc, toReview());
    expect([...s.board.corroboration.cards].sort()).toEqual([...ALL_PIECES].sort());
    expect(s.board.corroboration.mark).toBeNull();
  });

  it('판결 직전 자동 점검: 자백만 인정해 두면 verdict 진입 때 그 인정이 풀린다', () => {
    const pre: Step[] = [{ type: 'JUDGE_PIECE', cellId: 'corroboration', cardId: 'c_confession', verdict: 'ok' }];
    const s = play(sc, [...toReview(), ...pre, toPhase('verdict')]);
    expect(s.boardCheck?.dropped).toEqual([{ cellId: 'corroboration', cardId: 'c_confession' }]);
    expect(s.board.corroboration.mark).toBeNull();
  });

  it('자동 점검은 증명력을 건드리지 않는다: 보강증거를 인정했으면 그대로', () => {
    const pre: Step[] = [
      { type: 'JUDGE_PIECE', cellId: 'corroboration', cardId: 'c_confession', verdict: 'ok' },
      { type: 'JUDGE_PIECE', cellId: 'corroboration', cardId: 'c_cctv', verdict: 'ok' },
    ];
    const s = play(sc, [...toReview(), ...pre, toPhase('verdict')]);
    expect(s.boardCheck?.dropped).toEqual([]);
    expect(s.board.corroboration.mark).toBe('proven');
  });

  it('겹쳐 더듬기: 턱 걸린 줄만 메모 카드가 생기고, 일치하는 줄은 아무 일 없다', () => {
    const s = play(sc, [...toReview(), { type: 'RUB', rubId: 'r_owner_cctv', row: 0 }, { type: 'RUB', rubId: 'r_owner_cctv', row: 1 }]);
    expect(s.heldCards).toEqual(expect.arrayContaining(['m_time', 'm_count']));
    expect(() => play(sc, [{ type: 'RUB', rubId: 'r_owner_cctv', row: 2 }], s)).toThrow();
  });

  it('사소한 턱을 보고 증거를 다 인정 못 해 무죄를 내면 항소심에서 사실오인 파기', () => {
    const a = actions({ ...base, board: { corroboration: Object.fromEntries(ALL_PIECES.map((id) => [id, 'reject' as const])) }, sentence: null });
    const i = a.findIndex((x) => 'to' in x && x.to === 'phase:verdict');
    a.splice(i, 0, { type: 'RUB', rubId: 'r_owner_cctv', row: 0 });
    const s = play(sc, a);
    const out = reviewAppeal(sc, s);
    expect(out.result).toBe('reversed');
    expect(out.reasons.map((r) => r.code)).toContain('fact');
  });
});
