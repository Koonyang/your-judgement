// 겹쳐 더듬기: 두 기록을 줄마다 겹쳐 놓고 손가락(포인터)으로 문지른다. 어긋난 줄은 "턱" 걸리고 메모 카드가 생긴다.
// 턱이 사소한지 본질적인지는 알려 주지 않는다(증명력은 플레이어 몫). 키보드: 줄에 포커스 후 Enter/Space.
import type { Controller } from '../../game/controller';
import { rubFlag } from '../../engine/reducer';
import type { Rub, Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { button, h } from '../dom';

/** 한 줄을 "문질렀다"로 치는 포인터 이동 거리(px). */
const RUB_PX = 36;

export function createRubView(c: Controller, rub: Rub, onClose: () => void): { el: HTMLElement; paint(s: GameState, sc: Scenario): void } {
  const rubbed = new Set<number>();
  const travel = new Map<number, number>();
  let sc: Scenario | null = null;
  const rows = rub.rows.map((row, i) => {
    const memo = h('div', { class: 'rub-memo small' });
    const el = h('div', { class: 'rub-row', testid: `rub-row-${i}`, tabindex: '0', role: 'button', 'aria-label': `${i + 1}번째 줄 더듬기` },
      h('div', { class: 'rub-a' }, row.a), h('div', { class: 'rub-b' }, row.b), memo);
    el.dataset.i = String(i);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      rubRow(i);
    });
    return { el, memo };
  });
  const list = h('div', { class: 'rub-rows', testid: `rub-${rub.id}` }, ...rows.map((r) => r.el));
  const el = h('div', { class: 'rub-view' },
    h('div', { class: 'rub-head' }, h('b', {}, rub.title), button('btn-rub-close', '다 더듬었다', onClose, 'btn sm')),
    h('p', { class: 'muted small' }, `위 ${rub.a.label} · 아래 ${rub.b.label}. 겹친 종이를 손끝으로 쓸어 보십시오.`),
    list);

  function rubRow(i: number): void {
    if (rubbed.has(i)) return;
    rubbed.add(i);
    const snag = rub.rows[i].snag;
    if (snag) {
      c.dispatch({ type: 'RUB', rubId: rub.id, row: i });
      navigator.vibrate?.(30);
      rows[i].el.classList.add('bump');
    }
    paint(c.state, sc!);
  }

  // 누른 채 쓸고 지나가면 지나간 줄마다 이동 거리를 쌓는다.
  let last: { x: number; y: number } | null = null;
  list.addEventListener('pointerdown', (e) => {
    last = { x: e.clientX, y: e.clientY };
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!last) return;
    const d = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.rub-row');
    if (!row || !list.contains(row)) return;
    const i = Number(row.dataset.i);
    const t = (travel.get(i) ?? 0) + d;
    travel.set(i, t);
    if (t >= RUB_PX) rubRow(i);
  });
  const end = () => { last = null; };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);

  function paint(s: GameState, scenario: Scenario): void {
    sc = scenario;
    rub.rows.forEach((row, i) => {
      const found = !!row.snag && s.flags.includes(rubFlag(row.snag.id));
      const done = found || rubbed.has(i);
      const r = rows[i];
      r.el.classList.toggle('snag', found);
      r.el.classList.toggle('smooth', done && !row.snag);
      r.memo.textContent = found ? scenario.cards.find((x) => x.id === row.snag!.cardId)?.text ?? '' : done ? '매끈하다. 어긋남 없음.' : '';
    });
  }
  return { el, paint };
}
