// 쟁점 보드: 칸마다 증거 카드를 연결하고 [증명됨]/[의심 남음]을 고른다.
// mode: 'main'(유무죄 판단, [판단 확정] 포함) | 'drawer'(심리 중 서랍) | 'readonly'(모두절차 끝 확인용)
// 카드가 위반으로 사라지면 엔진이 보드에서 떼어 낸다(R6). 패널은 상태를 그대로 그린다.
import type { Controller } from '../../game/controller';
import { canConfirmVerdict, verdictOf, type CellMark } from '../../engine/board';
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';

export type BoardMode = 'main' | 'drawer' | 'readonly';

const MARK_LABEL: Record<Exclude<CellMark, null>, string> = { proven: '증명됨', doubt: '의심 남음' };

export function createBoardPanel(c: Controller, mode: BoardMode): Panel {
  // 서랍 인스턴스는 유무죄 판단 화면과 testid가 겹치지 않게 접두어를 붙인다.
  const pre = mode === 'drawer' ? 'drawer-' : '';
  const cells = h('div', { class: 'board-cells' });
  const verdictLine = h('p', { class: 'board-verdict', testid: mode === 'main' ? 'board-verdict' : `board-verdict-${mode}` });
  const confirm = button('btn-confirm-verdict', '판단 확정', () => c.dispatch({ type: 'CONFIRM_VERDICT' }), 'btn primary');
  const intro = mode === 'readonly'
    ? '공소사실을 요건별로 나눈 쟁점 보드가 만들어졌습니다. 선고 전까지 칸마다 증거를 연결하고 판단합니다.'
    : '칸마다 근거가 되는 증거 카드를 연결하고 [증명됨] 또는 [의심 남음]을 고르십시오. 모든 칸이 증명됨이면 유죄, 한 칸이라도 의심 남음이면 무죄입니다.';
  const el = h(
    'section',
    { class: `panel board board-${mode}`, testid: `panel-board-${mode}` },
    h('h2', {}, '쟁점 보드'),
    h('p', { class: 'muted small' }, intro),
    cells,
    ...(mode === 'main' ? [h('div', { class: 'board-foot' }, verdictLine, confirm)] : []),
  );

  let lastBoard: GameState['board'] | null = null;
  let lastHeld: GameState['heldCards'] | null = null;

  function cellView(s: GameState, sc: Scenario, cellId: string, name: string): HTMLElement {
    const st = s.board[cellId] ?? { cards: [], mark: null };
    const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
    const head = h('div', { class: 'cell-head' }, h('span', { class: 'cell-name' }, name));
    if (mode === 'readonly') {
      head.append(h('span', { class: 'cell-mark muted' }, '미판정'));
      return h('div', { class: 'cell', testid: `intro-board-cell-${cellId}` }, head,
        h('div', { class: 'muted small' }, st.cards.length ? st.cards.map(title).join(', ') : '연결된 증거 없음'));
    }
    for (const m of ['proven', 'doubt'] as const) {
      const b = button(`${pre}board-mark-${cellId}-${m}`, MARK_LABEL[m], () =>
        c.dispatch({ type: 'MARK_CELL', cellId, mark: st.mark === m ? null : m }), `btn mark ${m}`);
      b.classList.toggle('on', st.mark === m);
      b.setAttribute('aria-pressed', String(st.mark === m));
      head.append(b);
    }
    // 연결 후보: 보유한 증거 카드(사실 카드는 양형용). 연결된 카드는 눌린 상태로.
    const candidates = sc.cards.filter((x) => x.kind === 'evidence' && s.heldCards.includes(x.id));
    const chips = candidates.map((card) => {
      const on = st.cards.includes(card.id);
      const b = button(`${pre}board-card-${cellId}-${card.id}`, card.title, () =>
        c.dispatch({ type: on ? 'UNLINK_CARD' : 'LINK_CARD', cellId, cardId: card.id }), 'btn chip');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.title = card.text;
      return b;
    });
    return h('div', { class: `cell ${st.mark ?? 'unmarked'}`, testid: `${pre}board-cell-${cellId}` }, head,
      h('div', { class: 'chips' }, ...(chips.length ? chips : [h('span', { class: 'muted small' }, '연결할 수 있는 증거가 없습니다.')])));
  }

  return {
    el,
    render(s, sc) {
      if (s.board === lastBoard && s.heldCards === lastHeld) return;
      lastBoard = s.board;
      lastHeld = s.heldCards;
      cells.replaceChildren(...sc.cells.map((cell) => cellView(s, sc, cell.id, cell.name)));
      if (mode === 'main') {
        const ok = canConfirmVerdict(s.board);
        confirm.disabled = !ok;
        verdictLine.textContent = ok
          ? `판단: ${verdictOf(s.board) === 'guilty' ? '유죄' : '무죄'}`
          : '아직 판단하지 않은 칸이 있습니다.';
      }
    },
  };
}
