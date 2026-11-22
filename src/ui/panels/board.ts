// 쟁점 보드(길막기 판): 피고인은 3×3 판 위의 기물 하나. 갈 수 있는 방향 = 활로(쟁점). 다툴 게 없으면 폰(앞 한 칸).
// 검사의 증거는 입증취지대로 활로에 자동으로 올라온다. 판사는 기물마다 [인정]/[인정 못 함]만 한다(증언 기물은 [회상]).
// 인정한 기물이 있는 활로는 막히고, 모든 활로가 막히면 유죄.
// mode: 'main'(유무죄 판단, [판단 확정]) | 'drawer'(심리 중) | 'readonly'(모두절차 끝 안내)
import type { Controller } from '../../game/controller';
import { canConfirmVerdict, confessionOnly, verdictOf } from '../../engine/board';
import { rubOpen } from '../../engine/reducer';
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { arrowOf, layoutFor, SIZE } from '../chess';
import { button, h } from '../dom';
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

const VERDICT_LABEL = { ok: '신뢰', reject: '배척' } as const;
const ROUTE_STATE = { proven: '막힘', doubt: '열림', null: '판정 중' } as const;

/** 튜토리얼 설명(모두절차 끝 안내). */
export const TUTORIAL = '검사는 증거물을 통해 피고인의 활로를 막으려 합니다. 당신은 증거가 합당한지 판단하여, 검사가 피고인의 활로를 모두 막는 데 성공하면 유죄를 선고합니다.';

export function createBoardPanel(c: Controller, mode: BoardMode): Panel {
  // 서랍 인스턴스는 유무죄 판단 화면과 testid가 겹치지 않게 접두어를 붙인다.
  const pre = mode === 'drawer' ? 'drawer-' : mode === 'readonly' ? 'intro-' : '';
  const grid = h('div', { class: 'chess-grid', testid: `${pre}chess` });
  const routes = h('div', { class: 'routes', testid: `${pre}board-routes` });
  const status = h('p', { class: 'chess-status', testid: mode === 'main' ? 'board-verdict' : `board-verdict-${mode}` });
  const confirm = button('btn-confirm-verdict', '판단 확정', () => c.dispatch({ type: 'CONFIRM_VERDICT' }), 'btn primary');
  const thought = (t: string) => h('p', { class: 'board-thought' }, t);
  const check = h('div', { class: 'board-check', testid: 'board-check' });
  const rubSlot = h('div', { class: 'rub-slot' });
  /** 대조 기록: 대조에서 찾은 어긋남(메모 카드). 판단 참고용. */
  const memos = h('div', { class: 'memos', testid: `${pre}board-memos` });
  /** 대조 화면(열려 있으면 판 위에 겹친 종이). UI 전용 상태. */
  let rubView: ReturnType<typeof createRubView> | null = null;

  const el = h('section', { class: `panel board chess board-${mode}`, testid: `panel-board-${mode}` },
    h('h2', {}, '쟁점 보드'),
    ...(mode === 'readonly' ? [h('div', { class: 'board-thoughts', testid: 'board-first-thought' }, ...FIRST_USE_THOUGHT.map(thought)),
      h('div', { class: 'tutorial small', testid: 'board-tutorial' }, h('p', {}, TUTORIAL))] : []),
    ...(mode === 'main' ? [check] : []),
    h('div', { class: 'chess-main' }, grid, routes),
    ...(mode === 'readonly' ? [] : [memos]),
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
    at.set(`${l.at[0]},${l.at[1]}`, h('div', { class: `defendant${s.board && canConfirmVerdict(s.board) && verdictOf(s.board, sc.cards) === 'guilty' ? ' mated' : ''}`, testid: `${pre}board-king`, title: '피고인' }, l.glyph));
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
      // 대조: 두 기록이 다 확보되면 열린다(턱에서 나온 메모는 판단 참고용).
      for (const r of sc.rubs.filter((x) => x.cellId === cell.id)) {
        const b = button(`${pre}board-rub-${r.id}`, '대조', () => openRub(r.id), 'btn sm');
        b.disabled = !rubOpen(sc, s, r.id);
        b.title = r.title;
        row.firstElementChild!.append(b);
      }
      if (!st.cards.length) row.append(h('div', { class: 'small muted-holo' }, '검사가 막은 기물이 없다.'));
      for (const id of st.cards) {
        const v = st.judged?.[id] ?? null;
        const line = h('div', { class: `rpiece ${v ?? ''}` }, h('span', { class: 'rpiece-title' }, title(id)));
        if (c.recallLines(id).length) {
          const r = button(`${pre}board-recall-${id}`, '회상', () => c.recall(id), 'btn sm');
          r.disabled = c.replaying;
          line.prepend(r); // 회상은 기물 이름 왼쪽, 판정은 오른쪽 끝
        }
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

  function statusText(s: GameState, sc: Scenario): string {
    if (!canConfirmVerdict(s.board)) return '아직 판정하지 않은 기물이 있다.';
    if (confessionOnly(s.board, sc.cards)) return '믿은 증거가 자백뿐이다. 보강증거 없이는 유죄로 볼 수 없다: 무죄';
    return verdictOf(s.board, sc.cards) === 'guilty' ? '피고인의 활로가 모두 막혔다: 유죄' : '열린 활로가 남았다: 무죄';
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
      status.textContent = mode === 'readonly' ? '' : statusText(s, sc);
      const found = sc.cards.filter((x) => x.kind === 'memo' && s.heldCards.includes(x.id));
      memos.replaceChildren(h('b', { class: 'memos-title' }, '대조 기록'), ...(found.length
        ? found.map((m) => h('div', { class: 'memo-note', testid: `${pre}board-memo-${m.id}` }, m.text))
        : [h('span', { class: 'muted-holo small' }, '아직 대조한 기록이 없다.')]));
      if (mode === 'main') {
        confirm.disabled = !canConfirmVerdict(s.board);
        const dropped = s.boardCheck?.dropped ?? [];
        const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
        check.replaceChildren(...(dropped.length ? [
          h('div', { class: 'clerk-note' }, `참여관: 자백 말고는 신뢰한 증거가 없어 자백을 신뢰한 판정을 무릅니다(자백만으로는 유죄를 인정할 수 없음). ${[...new Set(dropped.map((d) => title(d.cardId)))].join(', ')}`),
          thought(CHECK_THOUGHT),
        ] : []));
      }
    },
  };
  return panel;
}
