// 쟁점 보드: 칸마다 증거 카드를 연결하고 [증명됨]/[의심 남음]을 고른다.
// mode: 'main'(유무죄 판단, [판단 확정] 포함) | 'drawer'(심리 중 서랍) | 'readonly'(모두절차 끝 확인용)
// 카드가 위반으로 사라지면 엔진이 보드에서 떼어 낸다(R6). 패널은 상태를 그대로 그린다.
import type { Controller } from '../../game/controller';
import { canConfirmVerdict, verdictOf, type CellMark } from '../../engine/board';
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';
import { createDnd } from '../drag';
import { rubOpen } from '../../engine/reducer';
import { createRubView } from './rub';

export type BoardMode = 'main' | 'drawer' | 'readonly';

// 재판장 속생각. shortcut: 회차 공통 독백이라 코드에 둠, 회차별로 달라지면 시나리오 데이터로 옮긴다
/** 처음 쟁점 보드를 볼 때 */
export const FIRST_USE_THOUGHT = [
  '증거능력엔 조문이라는 정답이 있지만, 증명력은 달라.',
  '지금까지의 증거로 도출된 사실을 어디까지 신뢰할지는... 마지막까지 내가 결정해야 해.',
];
/** 판결 직전 자동 점검에서 연결이 떨어졌을 때 */
export const CHECK_THOUGHT = '조문에 적합하지 않은 것들은 걸러냈다. 나머지는 스스로 판단해야 해.';

const MARK_LABEL: Record<Exclude<CellMark, null>, string> = { proven: '증명됨', doubt: '의심 남음' };

export function createBoardPanel(c: Controller, mode: BoardMode): Panel {
  // 서랍 인스턴스는 유무죄 판단 화면과 testid가 겹치지 않게 접두어를 붙인다.
  const pre = mode === 'drawer' ? 'drawer-' : '';
  const dnd = createDnd();
  const tray = h('div', { class: 'chips card-tray', testid: `${pre}board-tray` });
  const cells = h('div', { class: 'board-cells' });
  const verdictLine = h('p', { class: 'board-verdict', testid: mode === 'main' ? 'board-verdict' : `board-verdict-${mode}` });
  const confirm = button('btn-confirm-verdict', '판단 확정', () => c.dispatch({ type: 'CONFIRM_VERDICT' }), 'btn primary');
  const intro = mode === 'readonly'
    ? '공소사실을 요건별로 나눈 쟁점 보드가 만들어졌습니다. 선고 전까지 칸마다 증거를 연결하고 판단합니다.'
    : '칸을 눌러 [회상]하면 그 증언을 다시 듣고, [겹쳐 더듬기]로 두 기록의 어긋남을 찾습니다. 근거를 연결하고 [증명됨] 또는 [의심 남음]을 고르십시오. 모든 칸이 증명됨이면 유죄, 한 칸이라도 의심 남음이면 무죄입니다.';
  const thought = (t: string) => h('p', { class: 'board-thought' }, t);
  const firstUse = mode === 'readonly' ? [h('div', { class: 'board-thoughts', testid: 'board-first-thought' }, ...FIRST_USE_THOUGHT.map(thought))] : [];
  const check = h('div', { class: 'board-check', testid: 'board-check' });
  /** 겹쳐 더듬기 화면(열려 있으면 칸 목록 대신). UI 전용 상태. */
  let rubView: ReturnType<typeof createRubView> | null = null;
  const rubSlot = h('div', { class: 'rub-slot' });
  const el = h(
    'section',
    { class: `panel board board-${mode}`, testid: `panel-board-${mode}` },
    h('h2', {}, '쟁점 보드'),
    ...firstUse,
    h('p', { class: 'muted small' }, intro),
    ...(mode === 'main' ? [check] : []),
    ...(mode === 'readonly' ? [] : [tray]),
    cells,
    rubSlot,
    ...(mode === 'main' ? [h('div', { class: 'board-foot' }, verdictLine, confirm)] : []),
  );

  let lastKey: unknown[] = [];
  const isBoardCard = (kind: string) => kind === 'evidence' || kind === 'memo';

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
    const candidates = sc.cards.filter((x) => isBoardCard(x.kind) && s.heldCards.includes(x.id));
    const chips = candidates.map((card) => {
      const on = st.cards.includes(card.id);
      const b = button(`${pre}board-card-${cellId}-${card.id}`, card.title, () =>
        c.dispatch({ type: on ? 'UNLINK_CARD' : 'LINK_CARD', cellId, cardId: card.id }), `btn chip${card.kind === 'memo' ? ' memo' : ''}`);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.title = card.text;
      return b;
    });
    // 회상·겹쳐 더듬기
    const recall = button(`${pre}board-recall-${cellId}`, '회상', () => c.recall(cellId), 'btn sm');
    recall.disabled = c.replaying || c.recallLines(cellId).length === 0;
    head.insertBefore(recall, head.children[1]);
    for (const r of sc.rubs.filter((x) => x.cellId === cellId)) {
      const b = button(`${pre}board-rub-${r.id}`, '겹쳐 더듬기', () => openRub(r.id), 'btn sm');
      b.disabled = !rubOpen(sc, s, r.id);
      b.title = b.disabled ? '두 기록을 다 확보해야 겹쳐 볼 수 있습니다.' : r.title;
      head.insertBefore(b, head.children[2]);
    }
    const cell = h('div', { class: `cell ${st.mark ?? 'unmarked'}`, testid: `${pre}board-cell-${cellId}` }, head,
      h('div', { class: 'chips' }, ...(chips.length ? chips : [h('span', { class: 'muted small' }, '연결할 수 있는 증거가 없습니다.')])));
    // 위 카드 줄에서 칸으로 끌어다 놓으면 연결(이미 연결돼 있으면 그대로).
    dnd.target(cell, (cardId) => { if (!(c.state.board[cellId]?.cards ?? []).includes(cardId)) c.dispatch({ type: 'LINK_CARD', cellId, cardId }); });
    return cell;
  }

  function openRub(rubId: string | null): void {
    const r = c.sc.rubs.find((x) => x.id === rubId);
    rubView = r ? createRubView(c, r, () => openRub(null)) : null;
    rubSlot.replaceChildren(...(rubView ? [rubView.el] : []));
    lastKey = [];
    panel.render(c.state, c.sc);
  }

  const panel: Panel = {
    el,
    render(s, sc) {
      const key = [s.board, s.heldCards, s.flags, s.heard, s.boardCheck, c.replaying, rubView];
      if (key.every((k, i) => k === lastKey[i])) return;
      lastKey = key;
      el.classList.toggle('rubbing', !!rubView);
      rubView?.paint(s, sc);
      cells.replaceChildren(...sc.cells.map((cell) => cellView(s, sc, cell.id, cell.name)));
      if (mode === 'main') {
        const dropped = s.boardCheck?.dropped ?? [];
        const title = (id: string) => sc.cards.find((x) => x.id === id)?.title ?? id;
        const cellName = (id: string) => sc.cells.find((x) => x.id === id)?.name ?? id;
        check.replaceChildren(...(dropped.length ? [
          h('div', { class: 'clerk-note' }, `참여관: 자백 말고는 보강할 증거가 연결돼 있지 않아 떼어 냈습니다(자백만으로는 유죄를 인정할 수 없음). ${dropped.map((d) => `${cellName(d.cellId)} ← ${title(d.cardId)}`).join(', ')}`),
          thought(CHECK_THOUGHT),
        ] : []));
      }
      if (mode !== 'readonly') {
        tray.replaceChildren(...sc.cards.filter((x) => isBoardCard(x.kind) && s.heldCards.includes(x.id)).map((card) => {
          const t = h('span', { class: `btn chip card${card.kind === 'memo' ? ' memo' : ''}`, testid: `${pre}board-tray-${card.id}`, title: card.text }, card.title);
          dnd.source(t, card.id);
          return t;
        }));
      }
      if (mode === 'main') {
        const ok = canConfirmVerdict(s.board);
        confirm.disabled = !ok;
        verdictLine.textContent = ok
          ? `판단: ${verdictOf(s.board) === 'guilty' ? '유죄' : '무죄'}`
          : '아직 판단하지 않은 칸이 있습니다.';
      }
    },
  };
  return panel;
}
