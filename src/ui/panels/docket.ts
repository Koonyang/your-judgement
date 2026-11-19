// 사건 대기열: 배당된 기록 더미에서 사건을 연다.
import type { Controller } from '../../game/controller';
import { button, h } from '../dom';
import type { Panel } from './types';

export function createDocketPanel(c: Controller): Panel {
  const title = h('div', { class: 'case-title' });
  const court = h('div', { class: 'case-court' });
  const el = h(
    'section',
    { class: 'panel docket', testid: 'panel-docket' },
    h('h2', {}, '사건 대기열'),
    h('div', { class: 'case-file' }, h('div', { class: 'case-tag' }, '형사'), title, court),
    button('btn-open-case', '사건 열기', () => c.dispatch({ type: 'ADVANCE' }), 'btn primary'),
  );
  return {
    el,
    render(_s, sc) {
      title.textContent = sc.meta.title;
      court.textContent = sc.meta.court === 'single' ? '형사 단독' : '형사 합의부';
    },
  };
}
