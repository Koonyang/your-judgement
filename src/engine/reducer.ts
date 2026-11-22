// 게임 리듀서. 순수 함수: 입력 상태를 변형하지 않고, 무효/무변화 액션은 같은 객체를 돌려준다.
//
// 진행 규약(ADVANCE):
// - docket·pretrial·evidence·review: 현재 라인이 없으므로 ADVANCE 한 번에 다음 단계로.
// - opening·closing·exam: 라인 단위. ADVANCE는 현재 라인을 듣고 다음 `when` 충족 라인으로.
//   opening·closing은 라인이 소진되면(currentLine === null) 다음 ADVANCE로 다음 단계.
//   exam은 라인이 소진되면 즉시 보충신문(inSupp)이 열리고, ADVANCE는 무시, END_SUPP로 다음 Exam(마지막이면 closing).
// - verdict 이후는 확정 액션(CONFIRM_*, FINISH_*)으로만 진행.
import { canConfirmVerdict, verdictOf, withCell } from './board';
import { evalCond } from './cond';
import type { Scenario } from './scenario/schema';
import { validateSentence } from './sentencing';
import { PHASES, type Action, type GameState } from './state';
import {
  addCards, addFlags, blockLines, currentLine, hear, indexOfLine, moveCursor, recordViolation,
} from './flow/lines';
import { finishExam, nextPhase } from './flow/phases';

export { currentLine };
export { initialState } from './state';

export function heldCardSet(s: GameState): ReadonlySet<string> {
  return new Set(s.heldCards);
}

const SIMPLE_PHASES = new Set<GameState['phase']>(['docket', 'pretrial', 'evidence', 'review']);
const LINE_PHASES = new Set<GameState['phase']>(['opening', 'exam', 'closing']);
/** 쟁점 보드 편집은 유무죄 확정 전(verdict 단계까지)만. */
const boardEditable = (s: GameState) => PHASES.indexOf(s.phase) <= PHASES.indexOf('verdict');

/** 현재 블록에서 lineId(또는 '$end')로 점프. */
function jump(sc: Scenario, s: GameState, lineId: string): GameState {
  return moveCursor(sc, s, indexOfLine(blockLines(sc, s.cursor), lineId));
}
/** 현재 라인 다음으로. */
function stepPast(sc: Scenario, s: GameState, lineId: string): GameState {
  return moveCursor(sc, s, indexOfLine(blockLines(sc, s.cursor), lineId) + 1);
}

function advance(sc: Scenario, s: GameState): GameState {
  if (SIMPLE_PHASES.has(s.phase)) return nextPhase(sc, s);
  if (!LINE_PHASES.has(s.phase) || s.cursor.inSupp) return s;
  const line = currentLine(sc, s);
  if (!line) return nextPhase(sc, s);
  if (line.objection) return s; // RULE_OBJECTION 전까지 진행 불가
  return stepPast(sc, hear(s, line), line.id);
}

function interrupt(sc: Scenario, s: GameState): GameState {
  const line = currentLine(sc, s);
  const it = line?.interrupt;
  if (!line || !it) return s;
  let t = addFlags(s, it.sets); // 라인 자체의 효과는 적용하지 않는다
  if (it.legit) t = recordViolation(t, it.violation);
  return jump(sc, t, it.resumeAt);
}

function ruleObjection(sc: Scenario, s: GameState, ruling: 'sustain' | 'overrule'): GameState {
  const line = currentLine(sc, s);
  const ob = line?.objection;
  if (!line || !ob) return s;
  // 이의 라인 자체는 들은 것으로 처리한 뒤 결정 효과를 얹는다.
  let t = addFlags(hear(s, line), [`obj:${line.id}:${ruling}`]);
  if (ruling !== ob.correct) t = recordViolation(t, ob.violation);
  if (ruling === 'sustain') return jump(sc, addFlags(t, ob.onSustain.sets), ob.onSustain.resumeAt);
  return stepPast(sc, addFlags(t, ob.onOverrule?.sets), line.id);
}

/** 보충신문 질문 여부는 플래그 `supp:<questionId>`로 기록한다. */
export const suppFlag = (questionId: string) => `supp:${questionId}`;

function askSupp(sc: Scenario, s: GameState, questionId: string): GameState {
  if (s.phase !== 'exam' || !s.cursor.inSupp) return s;
  const q = sc.exams[s.cursor.examIndex]?.supplementary.find((x) => x.id === questionId);
  if (!q || s.flags.includes(suppFlag(q.id))) return s;
  // 질문(재판장 발언)도 들은 것으로 기록한 뒤 답변을 듣는다.
  let t = addFlags({ ...s, heard: [...s.heard, q.id] }, [suppFlag(q.id)]);
  for (const l of q.answer) if (evalCond(l.when, new Set(t.flags))) t = hear(t, l);
  if (q.kind !== 'clarify') t = recordViolation(t, q.violation);
  return t;
}

/** 겹쳐 더듬기에서 턱이 걸린 줄. 플래그 `rub:<snagId>`와 메모 카드를 남긴다. 턱 없는 줄은 상태 변화 없음. */
export const rubFlag = (snagId: string) => `rub:${snagId}`;
export function rubOpen(sc: Scenario, s: GameState, rubId: string): boolean {
  const r = sc.rubs.find((x) => x.id === rubId);
  if (!r) return false;
  return (r.requires.cards ?? []).every((id) => s.heldCards.includes(id)) && (r.requires.heard ?? []).every((id) => s.heard.includes(id));
}
function rub(sc: Scenario, s: GameState, rubId: string, row: number): GameState {
  const snag = sc.rubs.find((x) => x.id === rubId)?.rows[row]?.snag;
  if (!boardEditable(s) || !snag || !rubOpen(sc, s, rubId) || s.flags.includes(rubFlag(snag.id))) return s;
  return addCards(addFlags(s, [rubFlag(snag.id)]), [snag.cardId]);
}

/** 판사의 기물 판정. 칸에 올라와 있는 기물만. null이면 판정을 무른다. */
function judgePiece(s: GameState, cellId: string, cardId: string, verdict: 'ok' | 'reject' | null): GameState {
  const cell = s.board[cellId];
  if (!boardEditable(s) || !cell || !cell.cards.includes(cardId) || (cell.judged?.[cardId] ?? null) === verdict) return s;
  const judged = { ...cell.judged };
  if (verdict) judged[cardId] = verdict;
  else delete judged[cardId];
  return { ...s, board: { ...s.board, [cellId]: withCell(cell, { judged }) } };
}

/**
 * 검사가 증거를 내면 그 입증취지(card.proves) 칸에 기물이 자동으로 올라간다. 판결 확정 전까지만.
 * 칸 mark도 여기서 맞춘다(기물 없는 칸은 처음부터 열린 길). 바뀐 게 없으면 같은 객체.
 */
function fillBoard(sc: Scenario, s: GameState): GameState {
  if (!boardEditable(s)) return s;
  let board = s.board;
  for (const [cellId, cell] of Object.entries(s.board)) {
    const add = sc.cards.filter((c) => c.proves?.includes(cellId) && s.heldCards.includes(c.id) && !cell.cards.includes(c.id)).map((c) => c.id);
    const next = withCell(cell, { cards: [...cell.cards, ...add] });
    if (add.length || next.mark !== cell.mark) board = { ...board, [cellId]: next };
  }
  return board === s.board ? s : { ...s, board };
}

export function reduce(sc: Scenario, s: GameState, a: Action): GameState {
  const t = step(sc, s, a);
  return t === s ? s : fillBoard(sc, t);
}

function step(sc: Scenario, s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'ADVANCE': return advance(sc, s);
    case 'INTERRUPT': return interrupt(sc, s);
    case 'RULE_OBJECTION': return ruleObjection(sc, s, a.ruling);
    case 'ASK_SUPP': return askSupp(sc, s, a.questionId);
    case 'END_SUPP': return s.phase === 'exam' && s.cursor.inSupp ? finishExam(sc, s) : s;
    case 'HIGHLIGHT':
      if (s.highlights.some((h) => h.docId === a.docId && h.text === a.text)) return s;
      return { ...s, highlights: [...s.highlights, { docId: a.docId, text: a.text }] };
    case 'JUDGE_PIECE': return judgePiece(s, a.cellId, a.cardId, a.verdict);
    case 'RUB': return rub(sc, s, a.rubId, a.row);
    case 'CONFIRM_VERDICT':
      if (s.phase !== 'verdict' || !canConfirmVerdict(s.board)) return s;
      return { ...s, phase: verdictOf(s.board) === 'guilty' ? 'sentencing' : 'judgment' };
    case 'SET_SENTENCING':
      return s.phase === 'sentencing' ? { ...s, sentencing: { ...s.sentencing, ...a.patch } } : s;
    case 'CONFIRM_SENTENCING': {
      const { months, suspended } = s.sentencing;
      if (s.phase !== 'sentencing' || months === null) return s;
      if (validateSentence({ months, suspended }, sc.sentencing.statutoryMaxMonths) !== null) return s;
      return { ...s, phase: 'judgment' };
    }
    case 'SET_JUDGMENT':
      // 판결서 작성 화면은 양형 단계(저울질 뒤)에서 시작한다. 확정은 CONFIRM_SENTENCING → CONFIRM_JUDGMENT 순.
      return s.phase === 'sentencing' || s.phase === 'judgment' ? { ...s, judgment: { ...s.judgment, ...a.patch } } : s;
    case 'CONFIRM_JUDGMENT': return s.phase === 'judgment' ? { ...s, phase: 'pronounce' } : s;
    case 'FINISH_PRONOUNCE': return s.phase === 'pronounce' ? { ...s, phase: 'appeal' } : s;
    case 'FINISH_APPEAL': return s.phase === 'appeal' ? { ...s, phase: 'record' } : s;
  }
}
