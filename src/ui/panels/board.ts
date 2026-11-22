// 쟁점 보드(체스판): 피고인은 판 위의 기물 하나. 갈 수 있는 방향 = 빠져나갈 길(쟁점). 다툴 게 없으면 폰(앞 한 칸).
// 검사는 증거(기물)로 길을 막아 피고인이 더 이상 움직일 수 없게(체크메이트) 하려 한다. 증거는 입증취지대로 자동으로 올라온다.
// 판사는 두는 사람이 아니라 심판: 기물마다 [인정]/[인정 못 함]. 인정한 기물이 있는 길은 막히고, 없으면 열린다.
// 모든 길이 막히면 체크메이트 = 유죄. 책상 카드: [회상]은 그 증언 재생, 카드끼리 겹치면 겹쳐 더듬기(메모는 판단 참고용).
// mode: 'main'(유무죄 판단, [판단 확정]) | 'drawer'(심리 중) | 'readonly'(모두절차 끝 안내)
import type { Controller } from '../../game/controller';
import { canConfirmVerdict, verdictOf } from '../../engine/board';
import { rubOpen } from '../../engine/reducer';
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { arrowOf, layoutFor, SIZE } from '../chess';
import { button, h } from '../dom';
import { createDnd } from '../drag';
import { createRubView } from './rub';
import type { Panel } from './types';

export type BoardMode = 'main' | 'drawer' | 'readonly';

// 재판장 속생각. shortcut: 회차 공통 독백이라 코드에 둠, 회차별로 달라지면 시나리오 데이터로 옮긴다
/** 처음 쟁점 보드를 볼 때 */
export const FIRST_USE_THOUGHT = [
  '증거능력엔 조문이라는 정답이 있지만, 증명력은 달라.',
  '지금까지의 증거로 도출된 사실을 어디까지 신뢰할지는... 마지막까지 내가 결정해야 해.',
];
/** 판결 직전 자동 점검에서 연결이 떨어졌을 때 */
export const CHECK_THOUGHT = '조문에 적합하지 않은 것들은 걸러냈다. 나머지는 스스로 판단해야 해.';

const VERDICT_LABEL = { ok: '인정', reject: '인정 못 함' } as const;
const ROUTE_STATE = { proven: '막힘', doubt: '열림', null: '판정 중' } as const;

/** 튜토리얼 설명(모두절차 끝 안내). */
export const TUTORIAL = [
  '검사는 증거들을 통해 체크메이트를 선언하려 한다. 당신은 증거가 합당한지를 판단해서, 검사가 체크메이트에 성공한다면 유죄를 선고하면 된다.',
  '판 위의 피고인 기물이 더 이상 움직일 수 없으면 체크메이트다. 기물이 갈 수 있는 방향이 곧 빠져나갈 길(쟁점)이고, 다툴 것이 없는 사건은 앞으로만 가는 폰이다.',
  '검사의 증거는 길을 막는 기물로 자동으로 올라온다. 기물마다 [인정] 또는 [인정 못 함]을 정한다. 인정한 기물이 하나도 없는 길은 열린 채 남는다.',
];

export function createBoardPanel(c: Controller, mode: BoardMode): Panel {
  // 서랍 인스턴스는 유무죄 판단 화면과 testid가 겹치지 않게 접두어를 붙인다.
  const pre = mode === 'drawer' ? 'drawer-' : mode === 'readonly' ? 'intro-' : '';
  const dnd = createDnd();
  const grid = h('div', { class: 'chess-grid', testid: `${pre}chess` });
  const routes = h('div', { class: 'routes', testid: `${pre}board-routes` });
  const desk = h('div', { class: 'chess-desk', testid: `${pre}board-tray` });
  const status = h('p', { class: 'chess-status', testid: mode === 'main' ? 'board-verdict' : `board-verdict-${mode}` });
  const hint = h('p', { class: 'chess-hint small', testid: `${pre}board-hint` });
  const confirm = button('btn-confirm-verdict', '판단 확정', () => c.dispatch({ type: 'CONFIRM_VERDICT' }), 'btn primary');
  const thought = (t: string) => h('p', { class: 'board-thought' }, t);
  const check = h('div', { class: 'board-check', testid: 'board-check' });
  const rubSlot = h('div', { class: 'rub-slot' });
  /** 겹쳐 더듬기 화면(열려 있으면 판 위에 겹친 종이). UI 전용 상태. */
  let rubView: ReturnType<typeof createRubView> | null = null;

  const el = h('section', { class: `panel board chess board-${mode}`, testid: `panel-board-${mode}` },
    h('h2', {}, '쟁점 보드'),
    ...(mode === 'readonly' ? [h('div', { class: 'board-thoughts', testid: 'board-first-thought' }, ...FIRST_USE_THOUGHT.map(thought)),
      h('div', { class: 'tutorial small', testid: 'board-tutorial' }, ...TUTORIAL.map((t) => h('p', {}, t)))] : []),
    ...(mode === 'main' ? [check] : []),
    h('div', { class: 'chess-main' }, grid, routes),
    ...(mode === 'readonly' ? [] : [hint, desk]),
    h('div', { class: 'board-foot' }, status, ...(mode === 'main' ? [confirm] : [])),
    rubSlot,
  );

  function openRub(rubId: string | null): void {
    const r = c.sc.rubs.find((x) => x.id === rubId);
    rubView = r ? createRubView(c, r, () => openRub(null)) : null;
    rubSlot.replaceChildren(...(rubView ? [rubView.el] : []));
    lastKey = [];
    panel.render(c.state, c.sc);
  }

  /** 카드 위에 카드를 겹쳤다: 짝이 맞는 겹쳐 더듬기가 열려 있으면 연다. */
  function overlap(a: string, b: string): void {
    if (a === b) return;
    const r = c.sc.rubs.find((x) => {
      const need = x.requires.cards ?? [];
      return need.length === 2 && need.includes(a) && need.includes(b);
    });
    if (r && rubOpen(c.sc, c.state, r.id)) return openRub(r.id);
    hint.textContent = '겹쳐 봐도 맞대 볼 내용이 없다.';
  }

  /** 3×3 판: 피고인 기물과, 길마다 바로 옆 칸(길 이름·막힘 상태). */
  function board(s: GameState, sc: Scenario): HTMLElement[] {
    const l = layoutFor(sc.cells.length);
    const at = new Map<string, HTMLElement>();
    l.dirs.forEach(([dr, dc], i) => {
      const cell = sc.cells[i];
      const mark = s.board[cell.id]?.mark ?? null;
      const n = (s.board[cell.id]?.cards ?? []).length;
      at.set(`${l.at[0] + dr},${l.at[1] + dc}`, h('div', { class: `blocker ${mark ?? 'open-q'}`, title: cell.name, testid: `${pre}board-block-${cell.id}` },
        h('span', { class: 'blk-glyph' }, mark === 'proven' ? '■' : mark === 'doubt' ? arrowOf([dr, dc]) : n ? '?' : ''), h('span', { class: 'blk-name' }, cell.name)));
    });
    at.set(`${l.at[0]},${l.at[1]}`, h('div', { class: `defendant${s.board && canConfirmVerdict(s.board) && verdictOf(s.board) === 'guilty' ? ' mated' : ''}`, testid: `${pre}board-king`, title: '피고인' }, l.glyph));
    const out: HTMLElement[] = [];
    for (let r = 0; r < SIZE; r++) for (let col = 0; col < SIZE; col++) {
      out.push(h('div', { class: `bsq${(r + col) % 2 ? ' dark' : ''}` }, ...(at.has(`${r},${col}`) ? [at.get(`${r},${col}`)!] : [])));
    }
    return out;
  }

  /** 길 목록: 길마다 검사가 올린 기물과 판사의 판정. */
  function routeList(s: GameState, sc: Scenario): HTMLElement[] {
    const l = layoutFor(sc.cells.length);
    const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
    return sc.cells.map((cell, i) => {
      const st = s.board[cell.id] ?? { cards: [], mark: null };
      const row = h('div', { class: `route ${st.mark ?? 'pending'}`, testid: `${pre}board-cell-${cell.id}` },
        h('div', { class: 'route-head' }, h('span', { class: 'route-arrow' }, arrowOf(l.dirs[i])), h('b', {}, cell.name),
          h('span', { class: 'route-state' }, ROUTE_STATE[String(st.mark) as keyof typeof ROUTE_STATE])));
      if (mode === 'readonly') return row;
      if (!st.cards.length) row.append(h('div', { class: 'small muted-holo' }, '검사가 막은 기물이 없다.'));
      for (const id of st.cards) {
        const v = st.judged?.[id] ?? null;
        const line = h('div', { class: `rpiece ${v ?? ''}` }, h('span', { class: 'rpiece-title' }, title(id)));
        for (const want of ['ok', 'reject'] as const) {
          const b = button(`${pre}board-judge-${cell.id}-${id}-${want}`, VERDICT_LABEL[want], () =>
            c.dispatch({ type: 'JUDGE_PIECE', cellId: cell.id, cardId: id, verdict: v === want ? null : want }), `btn mark ${want}`);
          b.classList.toggle('on', v === want);
          b.setAttribute('aria-pressed', String(v === want));
          line.append(b);
        }
        row.append(line);
      }
      return row;
    });
  }

  function deskCards(s: GameState, sc: Scenario): HTMLElement[] {
    return sc.cards.filter((x) => (x.kind === 'evidence' || x.kind === 'memo') && s.heldCards.includes(x.id)).map((card, i) => {
      const t = h('div', { class: `desk-card${card.kind === 'memo' ? ' memo' : ''}`, testid: `${pre}board-tray-${card.id}`, title: card.text, style: `--tilt:${(i % 3) - 1}deg` },
        h('span', { class: 'dc-title' }, card.title));
      if (c.recallLines(card.id).length) {
        const r = button(`${pre}board-recall-${card.id}`, '회상', () => c.recall(card.id), 'btn sm dc-recall');
        r.addEventListener('click', (e) => e.stopPropagation()); // 카드 고르기로 번지지 않게
        r.disabled = c.replaying;
        r.addEventListener('pointerdown', (e) => e.stopPropagation()); // 회상 버튼은 끌기를 시작하지 않는다
        t.append(r);
      }
      // 카드 위에 카드를 겹치면 겹쳐 더듬기. target을 source보다 먼저 달아 고른 카드를 누르면 겹치기로 친다.
      dnd.target(t, (other) => overlap(other, card.id));
      dnd.source(t, card.id, { select: true });
      return t;
    });
  }

  function statusText(s: GameState): string {
    if (!canConfirmVerdict(s.board)) return '아직 판정하지 않은 기물이 있다.';
    return verdictOf(s.board) === 'guilty' ? '체크메이트. 피고인은 더 이상 움직일 수 없다: 유죄' : '빠져나갈 길이 남았다: 무죄';
  }

  let lastKey: unknown[] = [];
  const panel: Panel = {
    el,
    render(s, sc) {
      const key = [s.board, s.heldCards, s.flags, s.boardCheck, c.replaying, rubView];
      if (key.every((k, i) => k === lastKey[i])) return;
      lastKey = key;
      el.classList.toggle('rubbing', !!rubView);
      rubView?.paint(s, sc);
      grid.replaceChildren(...board(s, sc));
      routes.replaceChildren(...routeList(s, sc));
      status.textContent = mode === 'readonly' ? '' : statusText(s);
      if (mode !== 'readonly') {
        dnd.clear(); // 다시 그리면 고른 카드 요소가 바뀐다
        desk.replaceChildren(...deskCards(s, sc));
        if (!rubView) hint.textContent = '기물마다 인정 여부를 정한다. 증언 카드는 [회상], 카드끼리 겹치면 겹쳐 더듬기.';
      }
      if (mode === 'main') {
        confirm.disabled = !canConfirmVerdict(s.board);
        const dropped = s.boardCheck?.dropped ?? [];
        const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
        check.replaceChildren(...(dropped.length ? [
          h('div', { class: 'clerk-note' }, `참여관: 자백 말고는 인정한 증거가 없어 자백의 인정을 무릅니다(자백만으로는 유죄를 인정할 수 없음). ${[...new Set(dropped.map((d) => title(d.cardId)))].join(', ')}`),
          thought(CHECK_THOUGHT),
        ] : []));
      }
    },
  };
  return panel;
}
