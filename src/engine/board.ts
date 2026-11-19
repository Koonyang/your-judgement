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

export function boardFindings(
  b: BoardState,
  cards: Card[],
  appealView: AppealView[],
  flags: ReadonlySet<string>,
): BoardFindings {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const factMisfinding = Object.entries(b)
    .filter(([, c]) => c.mark === 'proven' && c.cards.length === 0)
    .map(([id]) => id);

  const linked = new Set<Card>();
  for (const c of Object.values(b)) {
    for (const id of c.cards) {
      const card = byId.get(id);
      if (card) linked.add(card);
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
