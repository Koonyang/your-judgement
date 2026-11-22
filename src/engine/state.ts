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
   * 법정에서 실제로 들은 진술 id(들은 순서). 라인(모두절차·신문·결심·이의 라인)과
   * 보충신문 질문 id(재판장 발언) 및 그 답변 라인. 제지로 끊은 라인, 이의 인용으로 건너뛴 라인은 없다.
   * 공판조서와 항소심의 철회 카드 판정이 이것을 쓴다.
   */
  heard: string[];
  /**
   * lineId: 현재(아직 듣지 않은) 라인 id. `when`이 충족되는 라인으로 항상 정규화되어 있고,
   * null이면 블록의 라인이 소진됐거나 라인 블록이 아닌 단계다.
   * inSupp: exam 블록에서 라인이 소진되면 true(보충신문). END_SUPP로 다음 Exam.
   */
  cursor: { block: LineBlock; examIndex: number; lineId: string | null; inSupp: boolean };
  board: BoardState;
  /** 판결 직전 자동 점검 결과(verdict 진입 때 한 번). 떼어 낸 연결 목록. */
  boardCheck: { dropped: { cellId: string; cardId: string }[] } | null;
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
  | { type: 'MARK_CELL'; cellId: string; mark: CellMark } | { type: 'RUB'; rubId: string; row: number } | { type: 'CONFIRM_VERDICT' }
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
    heard: [],
    cursor: { block: 'opening', examIndex: 0, lineId: null, inSupp: false },
    board: initBoard(sc.cells),
    boardCheck: null,
    sentencing: { special: [], general: [], susp: [], months: null, suspended: false },
    judgment: { evidenceSlots: [], favorable: [], unfavorable: [], addendum: '', deviationSlots: [] },
    outcome: null,
  };
}
