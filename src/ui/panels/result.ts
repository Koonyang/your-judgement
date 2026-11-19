// 항소 결과: 누가 항소했는지 → 결과(확정/항소기각/파기자판)·파기 사유·지적·항소심 형.
// 항소 없이 확정 + 1화(tutorial)이면 참여관 한 줄로 "항소가 있었다면" 지적을 짚는다.
import type { Controller } from '../../game/controller';
import { SUSPENSION_PERIOD_YEARS } from '../../engine/config';
import { formatSentence } from '../../engine/judgment';
import type { AppealOutcome } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';

export const RESULT_LABEL: Record<AppealOutcome['result'], string> = { final: '확정', dismissed: '항소기각', reversed: '파기자판' };
const CODE_LABEL: Record<AppealOutcome['reasons'][number]['code'], string> = {
  law: '법리오해', fact: '사실오인', procedure: '소송절차 위반', sentencing: '양형부당',
};

function appellantsText(a: AppealOutcome['appellants']): string {
  if (a.prosecutor && a.defendant) return '검사와 피고인이 모두 항소했습니다.';
  if (a.prosecutor) return '검사가 항소했습니다.';
  if (a.defendant) return '피고인이 항소했습니다.';
  return '검사도 피고인도 항소하지 않았습니다.';
}

function newSentenceText(n: NonNullable<AppealOutcome['newSentence']>): string {
  if (n.verdict === 'acquitted' || n.months === null) return '피고인은 무죄.';
  const base = `피고인을 ${formatSentence(n.months)}에 처한다.`;
  return n.suspended ? `${base} 다만, ${SUSPENSION_PERIOD_YEARS}년간 위 형의 집행을 유예한다.` : base;
}

export function createResultPanel(c: Controller): Panel {
  const body = h('div', { class: 'result-body' });
  const finish = button('btn-finish-appeal', '기록실로', () => c.dispatch({ type: 'FINISH_APPEAL' }), 'btn primary');
  const el = h('section', { class: 'panel main wide result', testid: 'panel-result' }, h('h2', {}, '항소'), body, h('div', { class: 'stage-foot' }, finish));
  let shown: AppealOutcome | null = null;
  return {
    el,
    render(s, sc) {
      const o = c.appealOutcome;
      if (s.phase !== 'appeal' || !o || o === shown) return;
      shown = o;
      const parts: HTMLElement[] = [
        h('p', { class: 'appellants', testid: 'result-appellants' }, appellantsText(o.appellants)),
        h('p', { class: `result-kind ${o.result}`, testid: 'result-kind' }, RESULT_LABEL[o.result]),
      ];
      if (o.reasons.length) {
        parts.push(h('h3', {}, '파기 사유'), h('ul', { testid: 'result-reasons' },
          ...o.reasons.map((r) => h('li', {}, h('span', { class: 'code' }, `[${CODE_LABEL[r.code]}] `), r.text))));
      }
      if (o.remarks.length) {
        parts.push(h('h3', {}, '지적 사항'), h('ul', { testid: 'result-remarks' }, ...o.remarks.map((r) => h('li', {}, r))));
      }
      if (o.newSentence) {
        parts.push(h('h3', {}, '항소심 주문'), h('p', { testid: 'result-new-sentence' }, newSentenceText(o.newSentence)));
      }
      if (o.result === 'final' && o.hypothetical.length > 0 && sc.meta.tutorial) {
        parts.push(h('p', { class: 'clerk-note', testid: 'result-hypothetical' },
          `참여관: 항소가 있었다면 이런 지적을 받았을 수 있습니다: ${o.hypothetical.join(' / ')}`));
      }
      if (o.result === 'final' && o.hypothetical.length === 0) parts.push(h('p', { class: 'muted' }, '판결이 그대로 확정되었습니다.'));
      body.replaceChildren(...parts);
    },
  };
}
