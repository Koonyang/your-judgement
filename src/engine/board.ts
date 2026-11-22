import type { AppealView, Card, Cell } from './scenario/schema';
import { evalCond } from './cond';

export type CellMark = 'proven' | 'doubt' | null;
export type BoardState = Record<string, { cards: string[]; mark: CellMark }>;
export type BoardFindings = {
  factMisfinding: string[];
  corroborationViolation: boolean;
  appealDisagree: string[];
};

export function initBoard(cells: Cell[]): BoardState {
  const b: BoardState = {};
  for (const c of cells) b[c.id] = { cards: [], mark: null };
  return b;
}

export function canConfirmVerdict(b: BoardState): boolean {
  return Object.values(b).every((c) => c.mark !== null);
}

export function verdictOf(b: BoardState): 'guilty' | 'acquitted' {
  return Object.values(b).some((c) => c.mark === 'doubt') ? 'acquitted' : 'guilty';
}

/** 증거로 셀 카드인가(판사 메모는 증거가 아님). */
const isEvidence = (c: Card | undefined) => !!c && c.kind !== 'memo';

/**
 * 판결 직전 자동 점검: 법이 정해 둔 규칙에 어긋난 연결만 떼어 낸다. 증명력(얼마나 믿을지)은 건드리지 않는다.
 * 지금 규칙은 보강법칙 하나: 보드 전체에 자백 말고 다른 증거가 없으면 자백 카드를 뗀다 `[§310, 확인필요]`.
 * 보강증거는 범죄사실 전부를 보강할 필요는 없다고 보아 칸별이 아니라 보드 전체로 본다 `[판례 확인필요]`.
 * (증거능력 없는 증거는 애초에 보유 카드가 되지 않아 연결할 수 없다.)
 */
export function corroborationCheck(b: BoardState, cards: Card[]): { board: BoardState; dropped: { cellId: string; cardId: string }[] } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const linked = Object.values(b).flatMap((c) => c.cards.map((id) => byId.get(id))).filter(isEvidence);
  if (!linked.length || !linked.every((c) => c!.confession === true)) return { board: b, dropped: [] };
  const dropped: { cellId: string; cardId: string }[] = [];
  const board: BoardState = {};
  for (const [cellId, c] of Object.entries(b)) {
    const keep = c.cards.filter((id) => {
      const drop = byId.get(id)?.confession === true;
      if (drop) dropped.push({ cellId, cardId: id });
      return !drop;
    });
    board[cellId] = { ...c, cards: keep };
  }
  return { board, dropped };
}

export function boardFindings(
  b: BoardState,
  cards: Card[],
  appealView: AppealView[],
  flags: ReadonlySet<string>,
): BoardFindings {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const factMisfinding = Object.entries(b)
    .filter(([, c]) => c.mark === 'proven' && !c.cards.some((id) => isEvidence(byId.get(id))))
    .map(([id]) => id);

  const linked = new Set<Card>();
  for (const c of Object.values(b)) {
    for (const id of c.cards) {
      const card = byId.get(id);
      if (isEvidence(card)) linked.add(card!);
    }
  }
  const corroborationViolation = linked.size > 0 && [...linked].every((c) => c.confession === true);

  const provenByView = new Set(
    appealView.filter((v) => v.proven && evalCond(v.when, flags)).map((v) => v.cellId),
  );
  const appealDisagree = Object.entries(b)
    .filter(([id, c]) => c.mark === 'doubt' && provenByView.has(id))
    .map(([id]) => id);

  return { factMisfinding, corroborationViolation, appealDisagree };
}
