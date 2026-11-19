// 공판 전 기록: 공소장·피고인 의견서. 문장을 골라 [형광펜]을 누르면 HIGHLIGHT.
import type { Controller } from '../../game/controller';
import type { GameState } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';

const DOCS = [
  { id: 'indictment', title: '공소장' },
  { id: 'defenseOpinion', title: '피고인 의견서' },
] as const;

/** 형광펜 구간을 <mark>로 감싼 노드들. */
function markedText(text: string, marks: string[]): Node[] {
  const on = new Array<boolean>(text.length).fill(false);
  for (const m of marks) {
    if (!m) continue;
    for (let i = text.indexOf(m); i >= 0; i = text.indexOf(m, i + 1)) on.fill(true, i, i + m.length);
  }
  const out: Node[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    const chunk = text.slice(i, j);
    out.push(on[i] ? h('mark', {}, chunk) : document.createTextNode(chunk));
    i = j;
  }
  return out;
}

export function createDocsPanel(c: Controller): Panel {
  const bodies = new Map<string, HTMLElement>();
  const sections = DOCS.map((d) => {
    const body = h('div', { class: 'doc-body', 'data-doc-id': d.id, testid: `doc-${d.id}` });
    bodies.set(d.id, body);
    return h('article', { class: 'doc' }, h('h3', {}, d.title), body);
  });
  const hint = h('span', { class: 'muted small' }, '문장을 드래그해 고른 뒤 누르세요.');
  const hl = button('btn-highlight', '형광펜', () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    const docOf = (n: Node | null | undefined) =>
      (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('[data-doc-id]')?.dataset.docId;
    const docId = docOf(sel?.anchorNode);
    if (!text || !docId || docId !== docOf(sel?.focusNode)) return;
    c.dispatch({ type: 'HIGHLIGHT', docId, text });
    sel?.removeAllRanges();
  });
  // 버튼을 눌러도 선택이 풀리지 않게.
  hl.addEventListener('mousedown', (e) => e.preventDefault());
  const list = h('ul', { class: 'highlight-list', testid: 'highlight-list' });
  const el = h(
    'section',
    { class: 'panel docs', testid: 'panel-docs' },
    h('h2', {}, '공판 전 기록'),
    ...sections,
    h('div', { class: 'toolbar' }, hl, hint),
    h('h3', {}, '형광펜'),
    list,
  );
  let last: GameState['highlights'] | null = null;
  return {
    el,
    render(s, sc) {
      if (s.highlights === last) return;
      last = s.highlights;
      for (const d of DOCS) {
        const marks = s.highlights.filter((x) => x.docId === d.id).map((x) => x.text);
        bodies.get(d.id)!.replaceChildren(...markedText(sc.documents[d.id], marks));
      }
      const title = (id: string) => DOCS.find((d) => d.id === id)?.title ?? id;
      list.replaceChildren(
        ...(s.highlights.length
          ? s.highlights.map((x) => h('li', {}, h('span', { class: 'hl-src' }, title(x.docId)), ` ${x.text}`))
          : [h('li', { class: 'muted' }, '아직 표시한 문장이 없습니다.')]),
      );
    },
  };
}
