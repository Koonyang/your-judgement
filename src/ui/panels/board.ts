// 쟁점 보드(체스판): 가운데 킹 = 공소사실 속 피고인, 둘러싼 칸 = 구성요건(탈출 칸).
// 검사가 낸 증거 카드(기물)를 칸에 올려 그 칸을 막는다. 판사는 두는 사람이 아니라 체크메이트를 판정하는 심판:
// 칸마다 [막힘](증명됨)/[탈출](의심 남음)을 정한다. 모든 칸이 막히면 체크메이트 = 유죄, 탈출 칸이 하나라도 있으면 무죄.
// 책상에 떨어진 카드: 끌어서 칸에 올리기(또는 눌러 고른 뒤 칸 누르기), 카드 위에 카드를 겹치면 겹쳐 더듬기, [회상]은 그 증언 재생.
// mode: 'main'(유무죄 판단, [판단 확정]) | 'drawer'(심리 중) | 'readonly'(모두절차 끝 안내)
import type { Controller } from '../../game/controller';
import { canConfirmVerdict, verdictOf } from '../../engine/board';
import { rubOpen } from '../../engine/reducer';
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
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

/** 3×3 판에서 구성요건 칸 자리(행, 열). 위·오른쪽·아래·왼쪽 다음 대각선. 가운데(2,2)는 킹. */
// shortcut: 구성요건 8개까지, 넘는 회차가 생기면 판을 키운다
const SQUARES: [number, number][] = [[1, 2], [2, 3], [3, 2], [2, 1], [1, 3], [3, 3], [3, 1], [1, 1]];
const MARK_LABEL = { proven: '막힘', doubt: '탈출' } as const;

export function createBoardPanel(c: Controller, mode: BoardMode): Panel {
  // 서랍 인스턴스는 유무죄 판단 화면과 testid가 겹치지 않게 접두어를 붙인다.
  const pre = mode === 'drawer' ? 'drawer-' : mode === 'readonly' ? 'intro-' : '';
  const dnd = createDnd();
  const grid = h('div', { class: 'chess-grid', testid: `${pre}chess` });
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
      h('p', { class: 'small chess-hint' }, '가운데 킹은 공소사실 속 피고인, 둘러싼 칸은 구성요건입니다. 증거로 모든 칸이 막히면 체크메이트(유죄), 빠져나갈 칸이 하나라도 남으면 무죄입니다.')] : []),
    ...(mode === 'main' ? [check] : []),
    grid,
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

  function square(s: GameState, sc: Scenario, i: number): HTMLElement {
    const cell = sc.cells[i];
    const [row, col] = SQUARES[i];
    const sq = h('div', { class: 'sq', style: `grid-row:${row};grid-column:${col}` });
    if (!cell) return sq;
    const st = s.board[cell.id] ?? { cards: [], mark: null };
    sq.classList.add('cell', st.mark ?? 'unmarked');
    sq.dataset.testid = `${pre}board-cell-${cell.id}`;
    const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
    sq.append(h('div', { class: 'sq-name' }, cell.name));
    if (mode === 'readonly') return sq;
    // 칸에 올린 기물: 누르면 내린다.
    sq.append(h('div', { class: 'pieces' }, ...st.cards.map((id) => {
      const memo = sc.cards.find((x) => x.id === id)?.kind === 'memo';
      return button(`${pre}board-piece-${cell.id}-${id}`, title(id), () => c.dispatch({ type: 'UNLINK_CARD', cellId: cell.id, cardId: id }), `piece${memo ? ' memo' : ''}`);
    })));
    const marks = h('div', { class: 'sq-marks' });
    for (const m of ['proven', 'doubt'] as const) {
      const b = button(`${pre}board-mark-${cell.id}-${m}`, MARK_LABEL[m], () =>
        c.dispatch({ type: 'MARK_CELL', cellId: cell.id, mark: st.mark === m ? null : m }), `btn mark ${m}`);
      b.classList.toggle('on', st.mark === m);
      b.setAttribute('aria-pressed', String(st.mark === m));
      marks.append(b);
    }
    sq.append(marks);
    dnd.target(sq, (cardId) => {
      if (!(c.state.board[cell.id]?.cards ?? []).includes(cardId)) c.dispatch({ type: 'LINK_CARD', cellId: cell.id, cardId });
    });
    return sq;
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
    if (!canConfirmVerdict(s.board)) return '아직 판정하지 않은 칸이 있다.';
    return verdictOf(s.board) === 'guilty' ? '체크메이트. 빠져나갈 칸이 없다: 유죄' : '탈출 칸이 남았다: 무죄';
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
      const ok = canConfirmVerdict(s.board);
      const mate = ok && verdictOf(s.board) === 'guilty';
      const king = h('div', { class: `sq king${mate ? ' mated' : ''}`, style: 'grid-row:2;grid-column:2', testid: `${pre}board-king` },
        h('div', { class: 'king-glyph' }, '♚'), h('div', { class: 'sq-name' }, '피고인'));
      grid.replaceChildren(...SQUARES.map((_, i) => square(s, sc, i)), king);
      status.textContent = mode === 'readonly' ? '' : statusText(s);
      if (mode !== 'readonly') {
        dnd.clear(); // 다시 그리면 고른 카드 요소가 바뀐다
        desk.replaceChildren(...deskCards(s, sc));
        if (!rubView) hint.textContent = '카드를 칸에 올려 막는다. 카드끼리 겹치면 겹쳐 더듬기.';
      }
      if (mode === 'main') {
        confirm.disabled = !ok;
        const dropped = s.boardCheck?.dropped ?? [];
        const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
        const cellName = (id: string) => sc.cells.find((x) => x.id === id)?.name ?? id;
        check.replaceChildren(...(dropped.length ? [
          h('div', { class: 'clerk-note' }, `참여관: 자백 말고는 보강할 증거가 올라가 있지 않아 반칙 기물로 내렸습니다(자백만으로는 유죄를 인정할 수 없음). ${dropped.map((d) => `${cellName(d.cellId)} ← ${title(d.cardId)}`).join(', ')}`),
          thought(CHECK_THOUGHT),
        ] : []));
      }
    },
  };
  return panel;
}
