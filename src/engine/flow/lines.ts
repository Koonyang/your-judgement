// 라인 블록(opening·exam·closing) 커서 이동과 효과 적용. 순수 함수만.
import { evalCond } from '../cond';
import { END_SENTINEL } from '../scenario/load';
import type { Line, Scenario, Violation } from '../scenario/schema';
import type { GameState } from '../state';

export function addUnique(arr: string[], items: readonly string[] | undefined): string[] {
  const add = (items ?? []).filter((x, i, a) => !arr.includes(x) && a.indexOf(x) === i);
  return add.length ? [...arr, ...add] : arr;
}

/** heldCards에서 카드를 빼고, 보드에 연결돼 있던 것도 함께 뗀다(보드 카드 ⊆ 보유 카드). */
export function removeCards(s: GameState, ids: readonly string[] | undefined): GameState {
  const gone = new Set((ids ?? []).filter((id) => s.heldCards.includes(id)));
  if (!gone.size) return s;
  const board = { ...s.board };
  for (const [cellId, c] of Object.entries(board)) {
    if (c.cards.some((id) => gone.has(id))) board[cellId] = { ...c, cards: c.cards.filter((id) => !gone.has(id)) };
  }
  return { ...s, heldCards: s.heldCards.filter((id) => !gone.has(id)), board };
}

export function addFlags(s: GameState, flags: readonly string[] | undefined): GameState {
  const next = addUnique(s.flags, flags);
  return next === s.flags ? s : { ...s, flags: next };
}

export function addCards(s: GameState, ids: readonly string[] | undefined): GameState {
  const next = addUnique(s.heldCards, ids);
  return next === s.heldCards ? s : { ...s, heldCards: next };
}

/** 라인을 "들은 것"으로 처리: sets → yieldsCards → revokesCards. */
export function hear(s: GameState, line: Line): GameState {
  return removeCards(addCards(addFlags(s, line.sets), line.yieldsCards), line.revokesCards);
}

/** 위반 기록. R2: lostCards는 heldCards에서 제거(항소심 복원은 이후 태스크). */
export function recordViolation(s: GameState, v: Violation | undefined): GameState {
  if (!v) return s;
  return removeCards({ ...s, violations: [...s.violations, v] }, v.lostCards);
}

export function blockLines(sc: Scenario, cursor: GameState['cursor']): Line[] {
  switch (cursor.block) {
    case 'opening': return sc.opening;
    case 'closing': return sc.closing.lines;
    case 'exam': return sc.exams[cursor.examIndex]?.lines ?? [];
  }
}

/** start 이상에서 `when`이 충족되는 첫 라인 id. 없으면 null. */
function resolveFrom(lines: Line[], start: number, flags: ReadonlySet<string>): string | null {
  for (let i = Math.max(0, start); i < lines.length; i++) if (evalCond(lines[i].when, flags)) return lines[i].id;
  return null;
}

export function indexOfLine(lines: Line[], id: string): number {
  if (id === END_SENTINEL) return lines.length;
  const i = lines.findIndex((l) => l.id === id);
  return i < 0 ? lines.length : i;
}

/**
 * 커서를 블록의 start 인덱스 이후 첫 충족 라인으로 옮긴다.
 * exam 블록에서 라인이 소진되면 보충신문(inSupp)을 연다.
 */
export function moveCursor(sc: Scenario, s: GameState, start: number): GameState {
  const lineId = resolveFrom(blockLines(sc, s.cursor), start, new Set(s.flags));
  const inSupp = s.cursor.block === 'exam' && lineId === null;
  return { ...s, cursor: { ...s.cursor, lineId, inSupp } };
}

export function currentLine(sc: Scenario, s: GameState): Line | null {
  const { cursor } = s;
  if (s.phase !== cursor.block || cursor.inSupp || cursor.lineId === null) return null;
  const lines = blockLines(sc, cursor);
  const id = resolveFrom(lines, indexOfLine(lines, cursor.lineId), new Set(s.flags));
  return lines.find((l) => l.id === id) ?? null;
}
