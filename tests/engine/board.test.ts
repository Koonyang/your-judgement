import { initBoard, canConfirmVerdict, verdictOf, boardFindings, corroborationCheck, withCell, confessionOnly } from '../../src/engine/board';
import type { Card, Cell } from '../../src/engine/scenario/schema';

const cells: Cell[] = [
  { id: 'act', name: '행위', disputed: false },
  { id: 'intent', name: '고의', disputed: true },
];
const cards: Card[] = [
  { id: 'conf', title: '자백', text: '', kind: 'evidence', confession: true },
  { id: 'cctv', title: 'CCTV', text: '', kind: 'evidence' },
];
const none = new Set<string>();

describe('board', () => {
  it('initBoard', () => {
    expect(initBoard(cells)).toEqual({ act: { cards: [], mark: null }, intent: { cards: [], mark: null } });
  });
  it('canConfirmVerdict false if any null', () => {
    const b = initBoard(cells);
    b.act.mark = 'proven';
    expect(canConfirmVerdict(b)).toBe(false);
    b.intent.mark = 'doubt';
    expect(canConfirmVerdict(b)).toBe(true);
  });
  it('verdictOf', () => {
    const b = initBoard(cells);
    b.act.mark = 'proven'; b.intent.mark = 'proven';
    expect(verdictOf(b, [])).toBe('guilty');
    b.intent.mark = 'doubt';
    expect(verdictOf(b, [])).toBe('acquitted');
  });
  it('verdictOf: 믿은 증거가 자백뿐이면 무죄(§310)', () => {
    const cards = [{ id: 'conf', confession: true }, { id: 'cctv' }] as Card[];
    const b = initBoard(cells);
    b.act = withCell(b.act, { cards: ['conf'], judged: { conf: 'ok' } });
    b.intent = withCell(b.intent, { cards: ['conf'], judged: { conf: 'ok' } });
    expect(verdictOf(b, cards)).toBe('acquitted');
    b.intent = withCell(b.intent, { cards: ['conf', 'cctv'], judged: { conf: 'ok', cctv: 'ok' } });
    expect(verdictOf(b, cards)).toBe('guilty');
  });
  it('factMisfinding: proven with no cards', () => {
    const b = initBoard(cells);
    b.act.mark = 'proven'; b.act.cards = ['cctv'];
    b.intent.mark = 'proven';
    expect(boardFindings(b, cards, [], none).factMisfinding).toEqual(['intent']);
  });
  it('confessionOnly is board-wide', () => {
    const b = initBoard(cells);
    b.act.cards = ['conf']; b.intent.cards = ['conf'];
    expect(confessionOnly(b, cards)).toBe(true);
    b.intent.cards = ['cctv'];
    expect(confessionOnly(b, cards)).toBe(false);
  });
  it('appealDisagree', () => {
    const b = initBoard(cells);
    b.act.mark = 'proven'; b.intent.mark = 'doubt';
    const views = [
      { cellId: 'intent', proven: true },
      { cellId: 'act', proven: true, when: { all: ['x'] } },
    ];
    expect(boardFindings(b, cards, views, none).appealDisagree).toEqual(['intent']);
    b.act.mark = 'doubt';
    expect(boardFindings(b, cards, views, new Set(['x'])).appealDisagree).toEqual(['act', 'intent']);
  });
});

describe('corroborationCheck', () => {
  const memo: Card = { id: 'memo', title: '메모', text: '', kind: 'memo' };
  it('인정한 기물이 자백뿐이면 자백의 인정을 무르고(기물은 남음), 메모는 보강증거로 치지 않는다', () => {
    const b = initBoard(cells);
    b.act = { cards: ['conf', 'memo'], mark: 'proven', judged: { conf: 'ok', memo: 'ok' } };
    b.intent = { cards: ['conf', 'cctv'], mark: 'proven', judged: { conf: 'ok', cctv: 'reject' } };
    const r = corroborationCheck(b, [...cards, memo]);
    expect(r.dropped).toEqual([{ cellId: 'act', cardId: 'conf' }, { cellId: 'intent', cardId: 'conf' }]);
    expect(r.board.act.cards).toEqual(['conf', 'memo']);
    expect(r.board.act.judged).toEqual({ memo: 'ok' });
    expect(r.board.intent.mark).toBeNull(); // 자백 판정이 풀려 다시 판정해야 한다
  });
  it('다른 증거가 하나라도 있으면 그대로', () => {
    const b = initBoard(cells);
    b.act.cards = ['conf']; b.intent.cards = ['cctv'];
    expect(corroborationCheck(b, cards)).toEqual({ board: b, dropped: [] });
  });
});
