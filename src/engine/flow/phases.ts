// 단계 전환. 단계 순서는 PHASES 나열 순.
import { evalCond } from '../cond';
import type { Scenario } from '../scenario/schema';
import { PHASES, type GameState, type LineBlock, type Phase } from '../state';
import { addCards, addUnique, moveCursor } from './lines';

function startBlock(sc: Scenario, s: GameState, block: LineBlock, examIndex = 0): GameState {
  return moveCursor(sc, { ...s, cursor: { block, examIndex, lineId: null, inSupp: false } }, 0);
}

/** 증거조사 진입: 동의 증거는 제출·열람 가능+카드, 부동의는 제출(표목)만. */
function fileEvidence(sc: Scenario, s: GameState): GameState {
  const consent = sc.evidence.filter((e) => e.consent);
  const next = {
    ...s,
    filedEvidence: addUnique(s.filedEvidence, sc.evidence.map((e) => e.id)),
    unlockedEvidence: addUnique(s.unlockedEvidence, consent.map((e) => e.id)),
  };
  return addCards(next, consent.flatMap((e) => (e.cardId ? [e.cardId] : [])));
}

export function enterPhase(sc: Scenario, s: GameState, phase: Phase): GameState {
  const t: GameState = { ...s, phase };
  switch (phase) {
    case 'opening': return startBlock(sc, t, 'opening');
    case 'closing': return startBlock(sc, t, 'closing');
    case 'exam': return sc.exams.length ? startBlock(sc, t, 'exam', 0) : enterPhase(sc, s, 'closing');
    case 'evidence': return fileEvidence(sc, { ...t, cursor: { ...t.cursor, lineId: null, inSupp: false } });
    default: return { ...t, cursor: { ...t.cursor, lineId: null, inSupp: false } };
  }
}

export function nextPhase(sc: Scenario, s: GameState): GameState {
  const i = PHASES.indexOf(s.phase);
  return i + 1 < PHASES.length ? enterPhase(sc, s, PHASES[i + 1]) : s;
}

/** Exam 종료: when 충족 unlocksEvidence 열람+카드, 다음 Exam 또는 closing. */
export function finishExam(sc: Scenario, s: GameState): GameState {
  const exam = sc.exams[s.cursor.examIndex];
  const flags = new Set(s.flags);
  const ids = (exam?.unlocksEvidence ?? []).filter((u) => evalCond(u.when, flags)).map((u) => u.evidenceId);
  const cards = sc.evidence.filter((e) => ids.includes(e.id) && e.cardId).map((e) => e.cardId!);
  const t = addCards({ ...s, unlockedEvidence: addUnique(s.unlockedEvidence, ids) }, cards);
  const n = s.cursor.examIndex + 1;
  return n < sc.exams.length ? startBlock(sc, t, 'exam', n) : enterPhase(sc, t, 'closing');
}
