// 게임 상태 타입과 초기 상태. phaser/DOM 비의존.
import { initBoard, type BoardState, type CellMark } from './board';
import type { Scenario, Violation } from './scenario/schema';

export const PHASES = [
  'docket', 'pretrial', 'opening', 'evidence', 'exam', 'closing', 'review',
  'verdict', 'sentencing', 'judgment', 'pronounce', 'appeal', 'record',
] as const;
export type Phase = (typeof PHASES)[number];

/** 라인으로 진행되는 블록. */
export type LineBlock = 'opening' | 'closing' | 'exam';

export type Appellants = { prosecutor: boolean; defendant: boolean };
export type AppealOutcome = {
  appellants: Appellants;
  result: 'final' | 'dismissed' | 'reversed';
  /** 파기 사유 */
  reasons: { code: 'law' | 'fact' | 'procedure' | 'sentencing'; text: string }[];
  /** 파기 아닌 지적 */
  remarks: string[];
  newSentence: { verdict: 'guilty' | 'acquitted'; months: number | null; suspended: boolean } | null;
  /** result==='final' && sc.meta.tutorial 일 때 참여관 한 줄용 */
  hypothetical: string[];
};

export type GameState = {
  phase: Phase;
  flags: string[];
  heldCards: string[];
  filedEvidence: string[];
  unlockedEvidence: string[];
  violations: Violation[];
  highlights: { docId: string; text: string }[];
  /**
   * lineId: 현재(아직 듣지 않은) 라인 id. `when`이 충족되는 라인으로 항상 정규화되어 있고,
   * null이면 블록의 라인이 소진됐거나 라인 블록이 아닌 단계다.
   * inSupp: exam 블록에서 라인이 소진되면 true(보충신문). END_SUPP로 다음 Exam.
   */
  cursor: { block: LineBlock; examIndex: number; lineId: string | null; inSupp: boolean };
  board: BoardState;
  sentencing: { special: string[]; general: string[]; susp: string[]; months: number | null; suspended: boolean };
  judgment: { evidenceSlots: string[]; favorable: string[]; unfavorable: string[]; addendum: string; deviationSlots: string[] };
  /** reviewAppeal 결과 (Task 7이 채움) */
  outcome: AppealOutcome | null;
};

export type Action =
  | { type: 'ADVANCE' } | { type: 'INTERRUPT' } | { type: 'RULE_OBJECTION'; ruling: 'sustain' | 'overrule' }
  | { type: 'ASK_SUPP'; questionId: string } | { type: 'END_SUPP' }
  | { type: 'HIGHLIGHT'; docId: string; text: string }
  | { type: 'LINK_CARD'; cellId: string; cardId: string } | { type: 'UNLINK_CARD'; cellId: string; cardId: string }
  | { type: 'MARK_CELL'; cellId: string; mark: CellMark } | { type: 'CONFIRM_VERDICT' }
  | { type: 'SET_SENTENCING'; patch: Partial<GameState['sentencing']> } | { type: 'CONFIRM_SENTENCING' }
  | { type: 'SET_JUDGMENT'; patch: Partial<GameState['judgment']> } | { type: 'CONFIRM_JUDGMENT' }
  | { type: 'FINISH_PRONOUNCE' } | { type: 'FINISH_APPEAL' };

export function initialState(sc: Scenario): GameState {
  return {
    phase: 'docket',
    flags: [],
    heldCards: [],
    filedEvidence: [],
    unlockedEvidence: [],
    violations: [],
    highlights: [],
    cursor: { block: 'opening', examIndex: 0, lineId: null, inSupp: false },
    board: initBoard(sc.cells),
    sentencing: { special: [], general: [], susp: [], months: null, suspended: false },
    judgment: { evidenceSlots: [], favorable: [], unfavorable: [], addendum: '', deviationSlots: [] },
    outcome: null,
  };
}
