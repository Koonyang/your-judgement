// 판결 기록실 항목. phaser/DOM 비의존.
import { verdictOf } from './board';
import { SUSPENSION_PERIOD_YEARS } from './config';
import { formatSentence } from './judgment';
import type { Scenario } from './scenario/schema';
import type { AppealOutcome, GameState } from './state';

export type RecordEntry = {
  caseId: string;
  title: string;
  verdict: string;
  sentence: string;
  result: AppealOutcome['result'];
  remarks: string[];
};

function sentenceText(months: number | null, suspended: boolean): string {
  if (months === null) return '';
  return suspended ? `${formatSentence(months)}, 집행유예 ${SUSPENSION_PERIOD_YEARS}년` : formatSentence(months);
}

export function toRecordEntry(sc: Scenario, s: GameState, o: AppealOutcome): RecordEntry {
  const guilty = verdictOf(s.board, sc.cards) === 'guilty';
  const remarks = [...o.reasons.map((r) => r.text), ...o.remarks];
  if (o.result === 'reversed' && o.newSentence) {
    const n = o.newSentence;
    remarks.push(`항소심: ${n.verdict === 'acquitted' ? '무죄' : sentenceText(n.months, n.suspended)}`);
  }
  return {
    caseId: sc.meta.id,
    title: sc.meta.title,
    verdict: guilty ? '유죄' : '무죄',
    sentence: guilty ? sentenceText(s.sentencing.months, s.sentencing.suspended) : '',
    result: o.result,
    remarks,
  };
}
