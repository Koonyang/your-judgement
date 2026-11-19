// 판결서 조립. phaser/DOM 비의존, 순수 함수.
import { verdictOf } from './board';
import type { Scenario } from './scenario/schema';
import type { GameState } from './state';

export type JudgmentDoc = {
  order: string[];
  facts: string;
  evidenceSummary: string[];
  lawApplied: string;
  sentencingReasons: { favorable: string[]; unfavorable: string[]; addendum: string | null };
  acquittalReasons?: string[];
};

/** 6 → '징역 6월', 12 → '징역 1년', 18 → '징역 1년 6월' */
export function formatSentence(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y > 0 ? `${y}년` : '', m > 0 ? `${m}월` : ''].filter(Boolean);
  return `징역 ${parts.join(' ')}`;
}

export function assembleJudgment(sc: Scenario, s: GameState): JudgmentDoc {
  const cardTitle = new Map(sc.cards.map((c) => [c.id, c.title]));
  const factorName = new Map(sc.sentencing.factors.map((f) => [f.id, f.name]));

  const resolve = (id: string): string | null => {
    const t = cardTitle.get(id) ?? factorName.get(id);
    if (t !== undefined) return t;
    const m = /^hl:(\d+)$/.exec(id);
    if (m) return s.highlights[Number(m[1])]?.text ?? null;
    return null;
  };
  const resolveAll = (ids: string[]) => ids.map(resolve).filter((x): x is string => x !== null);

  const acquitted = verdictOf(s.board) === 'acquitted';
  const order: string[] = [];
  if (acquitted) {
    order.push('피고인은 무죄.');
  } else if (s.sentencing.months !== null) {
    order.push(`피고인을 ${formatSentence(s.sentencing.months)}에 처한다.`);
    if (s.sentencing.suspended) order.push('다만, 이 판결 확정일부터 1년간 위 형의 집행을 유예한다.');
  }

  const doc: JudgmentDoc = {
    order,
    facts: sc.documents.facts,
    evidenceSummary: resolveAll(s.judgment.evidenceSlots.filter((id) => cardTitle.has(id))),
    lawApplied: sc.documents.lawApplied,
    sentencingReasons: {
      favorable: resolveAll(s.judgment.favorable),
      unfavorable: resolveAll(s.judgment.unfavorable),
      addendum: s.judgment.addendum === '' ? null : s.judgment.addendum,
    },
  };
  if (acquitted) {
    doc.acquittalReasons = sc.cells
      .filter((c) => s.board[c.id]?.mark === 'doubt')
      .map((c) => {
        const titles = (s.board[c.id].cards.map((id) => cardTitle.get(id)).filter(Boolean)) as string[];
        return `${c.name}: ${titles.length ? titles.join(', ') : '연결된 증거 없음'}`;
      });
  }
  return doc;
}
