import raw from '../fixtures/exam.json';
import { loadScenario } from '../../src/engine/scenario/load';
import { initialState, type Action, type GameState } from '../../src/engine/state';
import { reduce, currentLine, heldCardSet } from '../../src/engine/reducer';

const sc = loadScenario(raw);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
/** 입력 상태를 얼려서 리듀서가 변형하지 않음을 함께 검증한다. */
const R = (s: GameState, a: Action) => reduce(sc, deepFreeze(s), a);
const ADV: Action = { type: 'ADVANCE' };
const lineId = (s: GameState) => currentLine(sc, s)?.id ?? null;

function until(s: GameState, pred: (s: GameState) => boolean, limit = 50): GameState {
  for (let i = 0; i < limit && !pred(s); i++) {
    const next = currentLine(sc, s)?.objection
      ? R(s, { type: 'RULE_OBJECTION', ruling: currentLine(sc, s)!.objection!.correct })
      : s.cursor.inSupp ? R(s, { type: 'END_SUPP' }) : R(s, ADV);
    if (next === s) throw new Error(`stuck at ${s.phase}/${lineId(s)}`);
    s = next;
  }
  if (!pred(s)) throw new Error('limit');
  return s;
}
const toExam = () => until(initialState(sc), (s) => s.phase === 'exam');
const toVerdict = () => until(initialState(sc), (s) => s.phase === 'verdict');
function markAll(s: GameState, mark: 'proven' | 'doubt'): GameState {
  for (const c of sc.cells) s = R(s, { type: 'MARK_CELL', cellId: c.id, mark });
  return s;
}

describe('initialState', () => {
  it('starts at docket with empty board', () => {
    const s = initialState(sc);
    expect(s.phase).toBe('docket');
    expect(s.heldCards).toEqual([]);
    expect(s.board).toEqual({ act: { cards: [], mark: null }, intent: { cards: [], mark: null } });
    expect(s.outcome).toBeNull();
    expect(currentLine(sc, s)).toBeNull();
  });
});

describe('phase progress', () => {
  it('docket → pretrial → opening(o1); opening is line-driven', () => {
    let s = R(initialState(sc), ADV);
    expect(s.phase).toBe('pretrial');
    s = R(s, ADV);
    expect(s.phase).toBe('opening');
    expect(lineId(s)).toBe('o1');
    s = R(s, ADV);
    expect(lineId(s)).toBe('o2');
    s = R(s, ADV);
    expect(s.phase).toBe('opening');
    expect(s.flags).toContain('opened');
    expect(currentLine(sc, s)).toBeNull();
    s = R(s, ADV);
    expect(s.phase).toBe('evidence');
  });
  it('evidence entry: consent → filed+unlocked+card, non-consent → filed only', () => {
    const s = until(initialState(sc), (x) => x.phase === 'evidence');
    expect(s.filedEvidence).toEqual(['e_np', 'e_wit', 'e_cctv', 'e_receipt']);
    expect(s.unlockedEvidence).toEqual(['e_np']);
    expect(s.heldCards).toEqual(['c_np']);
  });
  it('evidence → exam starts at first exam first line', () => {
    const s = toExam();
    expect(s.cursor).toEqual({ block: 'exam', examIndex: 0, lineId: 'L1', inSupp: false });
  });
});

describe('exam lines', () => {
  it('ADVANCE to the end → c_rem held, c_np revoked', () => {
    const s = until(toExam(), (x) => x.cursor.inSupp);
    expect(heldCardSet(s).has('c_rem')).toBe(true);
    expect(heldCardSet(s).has('c_np')).toBe(false);
    expect(s.violations).toEqual([]);
    expect(currentLine(sc, s)).toBeNull();
  });
  it('INTERRUPT at L1 (legit) → no c_rem, 1 violation as-is, resume at L2', () => {
    const s = R(toExam(), { type: 'INTERRUPT' });
    expect(heldCardSet(s).has('c_rem')).toBe(false);
    expect(s.violations).toEqual([sc.exams[0].lines[0].interrupt!.violation]);
    expect(s.violations[0].affectsJudgment).toBe(true);
    expect(lineId(s)).toBe('L2');
  });
  it('legit violation removes lostCards even if already held (R2)', () => {
    // c_rem은 L1을 들은 뒤에만 생기므로 직접 주입해 확인
    const s0 = toExam();
    const s = R({ ...s0, heldCards: [...s0.heldCards, 'c_rem'] }, { type: 'INTERRUPT' });
    expect(s.heldCards).not.toContain('c_rem');
  });
  it('INTERRUPT at L2 (insult) → sets stop_insult, L3 skipped, c_np kept, no violation', () => {
    let s = R(toExam(), ADV);
    expect(lineId(s)).toBe('L2');
    s = R(s, { type: 'INTERRUPT' });
    expect(s.flags).toContain('stop_insult');
    expect(lineId(s)).toBe('L4');
    expect(heldCardSet(s).has('c_np')).toBe(true);
    expect(s.violations).toEqual([]);
  });
  it('INTERRUPT on a line without interrupt → same object', () => {
    const s = until(toExam(), (x) => lineId(x) === 'L6');
    expect(R(s, { type: 'INTERRUPT' })).toBe(s);
  });
  it('INTERRUPT outside line-driven phase → same object', () => {
    const s = initialState(sc);
    expect(R(s, { type: 'INTERRUPT' })).toBe(s);
  });
});

describe('objection', () => {
  const atL4 = () => until(toExam(), (x) => lineId(x) === 'L4');
  it('ADVANCE is ignored on an objection line', () => {
    const s = atL4();
    expect(R(s, ADV)).toBe(s);
  });
  it('wrong ruling (overrule) → violation, flag, continue to L5', () => {
    const s = R(atL4(), { type: 'RULE_OBJECTION', ruling: 'overrule' });
    expect(s.flags).toContain('obj:L4:overrule');
    expect(s.flags).toContain('leading_allowed');
    expect(s.violations.map((v) => v.id)).toEqual(['v_leading']);
    expect(lineId(s)).toBe('L5');
  });
  it('correct sustain → no violation, jump to resumeAt', () => {
    const s = R(atL4(), { type: 'RULE_OBJECTION', ruling: 'sustain' });
    expect(s.flags).toContain('obj:L4:sustain');
    expect(s.flags).toContain('leading_blocked');
    expect(s.violations).toEqual([]);
    expect(lineId(s)).toBe('L6');
    expect(until(s, (x) => x.cursor.inSupp).heldCards).not.toContain('c_bad');
  });
  it('RULE_OBJECTION on non-objection line → same object', () => {
    const s = toExam();
    expect(R(s, { type: 'RULE_OBJECTION', ruling: 'sustain' })).toBe(s);
  });
});

describe('supplementary questioning', () => {
  const inSupp = () => until(toExam(), (x) => x.cursor.inSupp);
  it('opens after the last line; ADVANCE ignored while in supp', () => {
    const s = inSupp();
    expect(s.phase).toBe('exam');
    expect(R(s, ADV)).toBe(s);
  });
  it('ASK_SUPP clarify applies answers (respecting when), no violation', () => {
    const s = R(inSupp(), { type: 'ASK_SUPP', questionId: 'q_clar' });
    expect(s.heldCards).toContain('c_clar');
    expect(s.heldCards).not.toContain('c_bad');
    expect(s.flags).toContain('asked_time');
    expect(s.violations).toEqual([]);
  });
  it('same question twice → second ignored', () => {
    const s = R(inSupp(), { type: 'ASK_SUPP', questionId: 'q_clar' });
    expect(R(s, { type: 'ASK_SUPP', questionId: 'q_clar' })).toBe(s);
  });
  it('non-clarify question → violation and lostCards removed', () => {
    const s0 = until(R(toExam(), ADV), (x) => x.cursor.inSupp); // L1 들었고 c_np는 L3에서 철회됨
    const withNp = { ...s0, heldCards: [...s0.heldCards, 'c_np'] };
    const s = R(withNp, { type: 'ASK_SUPP', questionId: 'q_proxy' });
    expect(s.heldCards).toContain('c_proxy');
    expect(s.heldCards).not.toContain('c_np');
    expect(s.violations.map((v) => v.id)).toEqual(['v_proxy']);
  });
  it('ASK_SUPP unknown id or outside supp → same object', () => {
    const s = inSupp();
    expect(R(s, { type: 'ASK_SUPP', questionId: 'nope' })).toBe(s);
    const t = toExam();
    expect(R(t, { type: 'ASK_SUPP', questionId: 'q_clar' })).toBe(t);
  });
  it('END_SUPP unlocks evidence whose when holds, then next exam', () => {
    const s = R(inSupp(), { type: 'END_SUPP' });
    expect(s.unlockedEvidence).toEqual(['e_np', 'e_cctv']);
    expect(s.heldCards).toContain('c_cctv');
    expect(s.heldCards).not.toContain('c_receipt');
    expect(s.cursor).toEqual({ block: 'exam', examIndex: 1, lineId: 'D1', inSupp: false });
  });
  it('END_SUPP outside supp → same object', () => {
    const s = toExam();
    expect(R(s, { type: 'END_SUPP' })).toBe(s);
  });
  it('last exam END_SUPP → closing (line-driven) → review', () => {
    let s = until(toExam(), (x) => x.phase === 'closing');
    expect(s.heldCards).toContain('c_def');
    expect(lineId(s)).toBe('k1');
    s = R(R(s, ADV), ADV);
    expect(s.phase).toBe('closing');
    expect(currentLine(sc, s)).toBeNull();
    s = R(s, ADV);
    expect(s.phase).toBe('review');
    s = R(s, ADV);
    expect(s.phase).toBe('verdict');
    expect(R(s, ADV)).toBe(s);
  });
});

describe('heard (들은 진술 기록)', () => {
  it('initialState는 빈 heard', () => {
    expect(initialState(sc).heard).toEqual([]);
  });
  it('끝까지 들으면(이의는 바른 결정=인용) 들은 라인을 순서대로 기록한다', () => {
    const s = until(toExam(), (x) => x.cursor.inSupp);
    expect(s.heard).toEqual(['o1', 'o2', 'L1', 'L2', 'L3', 'L4', 'L6']);
  });
  it('제지한 라인은 기록하지 않는다', () => {
    const s = R(toExam(), { type: 'INTERRUPT' });
    expect(s.heard).toEqual(['o1', 'o2']);
  });
  it('이의 라인은 결정과 함께 기록, 인용으로 건너뛴 답변은 기록하지 않는다', () => {
    const atL4 = until(toExam(), (x) => lineId(x) === 'L4');
    const s = until(R(atL4, { type: 'RULE_OBJECTION', ruling: 'sustain' }), (x) => x.cursor.inSupp);
    expect(s.heard.slice(-2)).toEqual(['L4', 'L6']);
    expect(s.heard).not.toContain('L5');
  });
  it('보충신문: 질문 id와 when 충족 답변만 기록한다', () => {
    const s0 = until(toExam(), (x) => x.cursor.inSupp);
    const s = R(s0, { type: 'ASK_SUPP', questionId: 'q_clar' });
    expect(s.heard.slice(s0.heard.length)).toEqual(['q_clar', 'qa1']);
  });
});

describe('notes and board', () => {
  it('HIGHLIGHT appends, duplicate ignored', () => {
    const s = R(initialState(sc), { type: 'HIGHLIGHT', docId: 'indictment', text: '공소' });
    expect(s.highlights).toEqual([{ docId: 'indictment', text: '공소' }]);
    expect(R(s, { type: 'HIGHLIGHT', docId: 'indictment', text: '공소' })).toBe(s);
  });
  it('LINK_CARD only with held cards; UNLINK_CARD removes', () => {
    const s0 = toVerdict();
    expect(R(s0, { type: 'LINK_CARD', cellId: 'act', cardId: 'c_receipt' })).toBe(s0);
    expect(R(s0, { type: 'LINK_CARD', cellId: 'nope', cardId: 'c_rem' })).toBe(s0);
    const s1 = R(s0, { type: 'LINK_CARD', cellId: 'act', cardId: 'c_rem' });
    expect(s1.board.act.cards).toEqual(['c_rem']);
    expect(s0.board.act.cards).toEqual([]);
    expect(R(s1, { type: 'LINK_CARD', cellId: 'act', cardId: 'c_rem' })).toBe(s1);
    const s2 = R(s1, { type: 'UNLINK_CARD', cellId: 'act', cardId: 'c_rem' });
    expect(s2.board.act.cards).toEqual([]);
    expect(R(s2, { type: 'UNLINK_CARD', cellId: 'act', cardId: 'c_rem' })).toBe(s2);
  });
  it('revoked card is also unlinked from the board', () => {
    let s = R(toExam(), { type: 'LINK_CARD', cellId: 'act', cardId: 'c_np' });
    expect(s.board.act.cards).toEqual(['c_np']);
    s = until(s, (x) => x.cursor.inSupp); // L3가 c_np 철회
    expect(s.board.act.cards).toEqual([]);
  });
  it('MARK_CELL sets mark; unknown cell ignored', () => {
    const s0 = toVerdict();
    const s1 = R(s0, { type: 'MARK_CELL', cellId: 'intent', mark: 'doubt' });
    expect(s1.board.intent.mark).toBe('doubt');
    expect(R(s0, { type: 'MARK_CELL', cellId: 'nope', mark: 'doubt' })).toBe(s0);
  });
});

describe('verdict / sentencing / judgment / pronounce', () => {
  it('CONFIRM_VERDICT with an unmarked cell → phase unchanged', () => {
    const s = R(toVerdict(), { type: 'MARK_CELL', cellId: 'act', mark: 'proven' });
    expect(R(s, { type: 'CONFIRM_VERDICT' })).toBe(s);
  });
  it('CONFIRM_VERDICT outside verdict phase → same object', () => {
    const s = markAll(toExam(), 'proven');
    expect(R(s, { type: 'CONFIRM_VERDICT' })).toBe(s);
  });
  it('acquitted → judgment directly', () => {
    const s = R(markAll(toVerdict(), 'doubt'), { type: 'CONFIRM_VERDICT' });
    expect(s.phase).toBe('judgment');
  });
  it('guilty → sentencing; invalid sentence ignored; valid → judgment', () => {
    let s = R(markAll(toVerdict(), 'proven'), { type: 'CONFIRM_VERDICT' });
    expect(s.phase).toBe('sentencing');
    expect(R(s, { type: 'CONFIRM_SENTENCING' })).toBe(s); // months null
    s = R(s, { type: 'SET_SENTENCING', patch: { months: 48, suspended: true, special: ['f1'] } });
    expect(s.sentencing).toEqual({ special: ['f1'], general: [], susp: [], months: 48, suspended: true });
    expect(R(s, { type: 'CONFIRM_SENTENCING' })).toBe(s); // 집유는 36개월 이하
    s = R(s, { type: 'SET_SENTENCING', patch: { months: 10 } });
    s = R(s, { type: 'CONFIRM_SENTENCING' });
    expect(s.phase).toBe('judgment');
  });
  it('양형 천칭: sentencing 단계에서 판결서 유리/불리만 채울 수 있다', () => {
    const s = R(markAll(toVerdict(), 'proven'), { type: 'CONFIRM_VERDICT' });
    const t = R(s, { type: 'SET_JUDGMENT', patch: { favorable: ['f1'], unfavorable: ['f2'] } });
    expect(t.judgment.favorable).toEqual(['f1']);
    expect(t.judgment.unfavorable).toEqual(['f2']);
    expect(R(s, { type: 'SET_JUDGMENT', patch: { addendum: 'x' } })).toBe(s);
    expect(R(s, { type: 'SET_JUDGMENT', patch: { favorable: ['f1'], evidenceSlots: ['e'] } })).toBe(s);
  });
  it('SET_SENTENCING outside sentencing → same object', () => {
    const s = toVerdict();
    expect(R(s, { type: 'SET_SENTENCING', patch: { months: 3 } })).toBe(s);
  });
  it('judgment → pronounce → appeal → record; outcome stays null', () => {
    let s = R(markAll(toVerdict(), 'doubt'), { type: 'CONFIRM_VERDICT' });
    s = R(s, { type: 'SET_JUDGMENT', patch: { addendum: '부기', evidenceSlots: ['e_np'] } });
    expect(s.judgment.addendum).toBe('부기');
    expect(s.judgment.evidenceSlots).toEqual(['e_np']);
    expect(R(s, { type: 'FINISH_PRONOUNCE' })).toBe(s);
    s = R(s, { type: 'CONFIRM_JUDGMENT' });
    expect(s.phase).toBe('pronounce');
    expect(R(s, { type: 'SET_JUDGMENT', patch: { addendum: 'x' } })).toBe(s);
    s = R(s, { type: 'FINISH_PRONOUNCE' });
    expect(s.phase).toBe('appeal');
    s = R(s, { type: 'FINISH_APPEAL' });
    expect(s.phase).toBe('record');
    expect(s.outcome).toBeNull();
    expect(R(s, ADV)).toBe(s);
  });
});
