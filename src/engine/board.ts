import type { AppealView, Card, Cell } from './scenario/schema';
import { evalCond } from './cond';

export type CellMark = 'proven' | 'doubt' | null;
/** 판사가 기물(검사가 칸에 올린 증거)마다 내린 판정. */
export type PieceVerdict = 'ok' | 'reject';
/**
 * 칸 = 피고인 기물이 빠져나갈 수 있는 길(쟁점). cards = 검사가 그 길을 막으려 올린 증거(입증취지 `proves`로 자동).
 * mark는 judged에서 파생: 인정한 기물이 있으면 막힘(proven), 기물이 없거나 다 인정 못 하면 열림(doubt), 그 밖은 미정(null).
 */
export type BoardCell = { cards: string[]; mark: CellMark; judged?: Record<string, PieceVerdict> };
export type BoardState = Record<string, BoardCell>;

/** 칸에서 판사가 인정한 기물(판정 기록이 없는 옛 상태는 올라온 기물 전부). */
export const acceptedPieces = (c: BoardCell): string[] => (c.judged ? c.cards.filter((id) => c.judged![id] === 'ok') : c.cards);

export function deriveMark(c: BoardCell): CellMark {
  if (!c.cards.length) return 'doubt';
  if (c.cards.some((id) => c.judged?.[id] === 'ok')) return 'proven';
  return c.cards.every((id) => c.judged?.[id] === 'reject') ? 'doubt' : null;
}

/** 칸 하나를 고친 뒤 mark를 다시 계산한 새 칸. */
export function withCell(c: BoardCell, patch: Partial<BoardCell>): BoardCell {
  const next = { ...c, ...patch };
  return { ...next, mark: deriveMark(next) };
}
export type BoardFindings = {
  factMisfinding: string[];
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

/** 칸이 하나라도 열렸거나, 믿은 증거가 자백뿐이면(보강증거 없음 `[§310]`) 무죄. */
export function verdictOf(b: BoardState, cards: Card[]): 'guilty' | 'acquitted' {
  return Object.values(b).some((c) => c.mark === 'doubt') || confessionOnly(b, cards) ? 'acquitted' : 'guilty';
}

/** 증거로 셀 카드인가(판사 메모는 증거가 아님). */
const isEvidence = (c: Card | undefined) => !!c && c.kind !== 'memo';

/** 판사가 인정한 증거가 있고, 그게 전부 자백인가. */
export function confessionOnly(b: BoardState, cards: Card[]): boolean {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const accepted = Object.values(b).flatMap((c) => acceptedPieces(c).map((id) => byId.get(id))).filter(isEvidence);
  return accepted.length > 0 && accepted.every((c) => c!.confession === true);
}

/**
 * 판결 직전 자동 점검: 법이 정해 둔 규칙에 어긋난 연결만 떼어 낸다. 증명력(얼마나 믿을지)은 건드리지 않는다.
 * 지금 규칙은 보강법칙 하나: 보드 전체에 자백 말고 다른 증거가 없으면 자백 카드를 뗀다 `[§310, 확인필요]`.
 * 보강증거는 범죄사실 전부를 보강할 필요는 없다고 보아 칸별이 아니라 보드 전체로 본다 `[판례 확인필요]`.
 * (증거능력 없는 증거는 애초에 보유 카드가 되지 않아 연결할 수 없다.)
 */
export function corroborationCheck(b: BoardState, cards: Card[]): { board: BoardState; dropped: { cellId: string; cardId: string }[] } {
  if (!confessionOnly(b, cards)) return { board: b, dropped: [] };
  const byId = new Map(cards.map((c) => [c.id, c]));
  // 자백 기물의 [인정]을 무른다(기물은 판에 남고 다시 판정해야 한다).
  const dropped: { cellId: string; cardId: string }[] = [];
  const board: BoardState = {};
  for (const [cellId, c] of Object.entries(b)) {
    const judged = { ...c.judged };
    for (const id of acceptedPieces(c)) {
      if (byId.get(id)?.confession !== true) continue;
      dropped.push({ cellId, cardId: id });
      delete judged[id];
    }
    board[cellId] = withCell(c, { judged });
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
    .filter(([, c]) => c.mark === 'proven' && !acceptedPieces(c).some((id) => isEvidence(byId.get(id))))
    .map(([id]) => id);

  const provenByView = new Set(
    appealView.filter((v) => v.proven && evalCond(v.when, flags)).map((v) => v.cellId),
  );
  const appealDisagree = Object.entries(b)
    .filter(([id, c]) => c.mark === 'doubt' && provenByView.has(id))
    .map(([id]) => id);

  return { factMisfinding, appealDisagree };
}
