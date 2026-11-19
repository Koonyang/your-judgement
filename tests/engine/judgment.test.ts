import { assembleJudgment, formatSentence } from '../../src/engine/judgment';
import { initialState } from '../../src/engine/state';
import type { Scenario } from '../../src/engine/scenario/schema';

const sc = {
  documents: { facts: '범죄사실', lawApplied: '형법 제329조' },
  cells: [
    { id: 'act', name: '행위', disputed: false },
    { id: 'intent', name: '고의', disputed: true },
  ],
  cards: [
    { id: 'cctv', title: 'CCTV', text: '', kind: 'evidence' },
    { id: 'conf', title: '자백', text: '', kind: 'evidence' },
  ],
  sentencing: { factors: [{ id: 'first', name: '초범' }] },
} as unknown as Scenario;

function guilty() {
  const s = initialState(sc);
  s.board.act.mark = 'proven';
  s.board.intent.mark = 'proven';
  s.sentencing.months = 6;
  s.sentencing.suspended = true;
  return s;
}

describe('formatSentence', () => {
  it('6/12/18', () => {
    expect(formatSentence(6)).toBe('징역 6월');
    expect(formatSentence(12)).toBe('징역 1년');
    expect(formatSentence(18)).toBe('징역 1년 6월');
  });
});

describe('assembleJudgment', () => {
  it('유죄 집유 주문 2문장', () => {
    const j = assembleJudgment(sc, guilty());
    expect(j.order).toEqual(['피고인을 징역 6월에 처한다.', '다만, 이 판결 확정일부터 1년간 위 형의 집행을 유예한다.']);
    expect(j.facts).toBe('범죄사실');
    expect(j.lawApplied).toBe('형법 제329조');
    expect(j.acquittalReasons).toBeUndefined();
  });
  it('실형이면 주문 1문장', () => {
    const s = guilty(); s.sentencing.suspended = false;
    expect(assembleJudgment(sc, s).order).toEqual(['피고인을 징역 6월에 처한다.']);
  });
  it('무죄면 acquittalReasons', () => {
    const s = guilty();
    s.board.intent.mark = 'doubt';
    s.board.intent.cards = ['cctv', 'conf'];
    s.board.act.mark = 'doubt';
    const j = assembleJudgment(sc, s);
    expect(j.order).toEqual(['피고인은 무죄.']);
    expect(j.acquittalReasons).toEqual(['행위: 연결된 증거 없음', '고의: CCTV, 자백']);
  });
  it('addendum 빈 문자열 → null', () => {
    const s = guilty();
    expect(assembleJudgment(sc, s).sentencingReasons.addendum).toBeNull();
    s.judgment.addendum = '덧붙임';
    expect(assembleJudgment(sc, s).sentencingReasons.addendum).toBe('덧붙임');
  });
  it('증거요지와 양형 이유 해석', () => {
    const s = guilty();
    s.highlights = [{ docId: 'd', text: '형광펜 문장' }];
    s.judgment.evidenceSlots = ['conf', 'cctv', 'nope'];
    s.judgment.favorable = ['first', 'hl:0', 'zzz'];
    s.judgment.unfavorable = ['cctv', 'hl:5'];
    const j = assembleJudgment(sc, s);
    expect(j.evidenceSummary).toEqual(['자백', 'CCTV']);
    expect(j.sentencingReasons.favorable).toEqual(['초범', '형광펜 문장']);
    expect(j.sentencingReasons.unfavorable).toEqual(['CCTV']);
  });
});
