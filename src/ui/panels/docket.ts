// 사건 대기열: 배당된 기록 더미에서 사건을 연다.
import type { Controller } from '../../game/controller';
import { button, h } from '../dom';
import { normalizeNickname, SEAL_MAX, sealLayout } from '../seal';
import { loadNickname, saveNickname } from '../storage';
import type { Panel } from './types';

export function createDocketPanel(c: Controller): Panel {
  const title = h('div', { class: 'case-title' });
  const court = h('div', { class: 'case-court' });
  // 판사 이름: 선고 때 판결서에 찍히는 도장에 새긴다.
  const input = h('input', { id: 'judge-nickname', testid: 'judge-nickname', class: 'nick-input', maxlength: String(SEAL_MAX), placeholder: '판사' });
  input.value = loadNickname();
  const seal = h('div', { class: 'seal-preview', testid: 'seal-preview', 'aria-hidden': 'true' });
  const drawSeal = () => {
    const l = sealLayout(input.value);
    seal.style.gridTemplateColumns = `repeat(${l.cols}, 1fr)`;
    seal.style.gridTemplateRows = `repeat(${l.rows}, 1fr)`;
    seal.dataset.size = String(Math.max(l.cols, l.rows));
    seal.replaceChildren(...l.cells.map((c) => h('span', { style: `grid-column:${c.col + 1};grid-row:${c.row + 1}` }, c.ch)));
  };
  input.addEventListener('input', () => {
    saveNickname(normalizeNickname(input.value));
    drawSeal();
  });
  drawSeal();
  const nick = h('label', { class: 'nick', for: 'judge-nickname' }, h('span', {}, '판사 이름 (도장에 새김, 4자까지)'), h('div', { class: 'nick-row' }, input, seal));
  const el = h(
    'section',
    { class: 'panel docket', testid: 'panel-docket' },
    h('h2', {}, '사건 대기열'),
    h('div', { class: 'case-file' }, h('div', { class: 'case-tag' }, '형사'), title, court),
    nick,
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
