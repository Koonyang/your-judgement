import { initBoard, canConfirmVerdict, verdictOf, boardFindings, corroborationCheck } from '../../src/engine/board';
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
    expect(verdictOf(b)).toBe('guilty');
    b.intent.mark = 'doubt';
    expect(verdictOf(b)).toBe('acquitted');
  });
  it('factMisfinding: proven with no cards', () => {
    const b = initBoard(cells);
    b.act.mark = 'proven'; b.act.cards = ['cctv'];
    b.intent.mark = 'proven';
    expect(boardFindings(b, cards, [], none).factMisfinding).toEqual(['intent']);
  });
  it('corroborationViolation is board-wide', () => {
    const b = initBoard(cells);
    b.act.cards = ['conf']; b.intent.cards = ['conf'];
    expect(boardFindings(b, cards, [], none).corroborationViolation).toBe(true);
    b.intent.cards = ['cctv'];
    expect(boardFindings(b, cards, [], none).corroborationViolation).toBe(false);
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
  it('자백만 있으면 자백을 떼고, 메모는 보강증거로 치지 않는다', () => {
    const b = initBoard(cells);
    b.act.cards = ['conf', 'memo']; b.intent.cards = ['conf'];
    const r = corroborationCheck(b, [...cards, memo]);
    expect(r.dropped).toEqual([{ cellId: 'act', cardId: 'conf' }, { cellId: 'intent', cardId: 'conf' }]);
    expect(r.board.act.cards).toEqual(['memo']);
  });
  it('다른 증거가 하나라도 있으면 그대로', () => {
    const b = initBoard(cells);
    b.act.cards = ['conf']; b.intent.cards = ['cctv'];
    expect(corroborationCheck(b, cards)).toEqual({ board: b, dropped: [] });
  });
});
