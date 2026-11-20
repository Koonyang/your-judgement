// 기록: 공소장·피고인 의견서(공판 전부터), 공판조서(선고기일 전 재검토부터). 문장을 골라 [형광펜]을 누르면 HIGHLIGHT.
//
// 공판조서는 엔진의 `heard`(실제로 들은 진술, 들은 순서)를 그대로 옮긴다. 제지로 끊은 진술이나
// 이의 인용으로 막은 답변은 들은 적이 없으므로 조서에도 없다(판사가 본 것만 본다).
import { examineeName, speakerLabel, type Controller } from '../../game/controller';
import { heardEntries } from '../../engine/flow/lines';
import type { Scenario } from '../../engine/scenario/schema';
import { PHASES, type GameState } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';

const DOCS = [
  { id: 'indictment', title: '공소장' },
  { id: 'defenseOpinion', title: '피고인 의견서' },
] as const;
const HL_TITLES: Record<string, string> = { indictment: '공소장', defenseOpinion: '피고인 의견서', closing: '최후진술', transcript: '공판조서' };
const showTranscript = (s: GameState) => PHASES.indexOf(s.phase) >= PHASES.indexOf('review');

/** 공판조서: heard를 들은 순서대로, 절차가 바뀔 때마다 머리줄을 단다. */
export function transcriptText(sc: Scenario, s: GameState): string {
  const out: string[] = [];
  let section = '';
  for (const e of heardEntries(sc, s)) {
    const exam = e.block === 'exam' ? sc.exams[e.examIndex] : undefined;
    const head = e.block === 'opening' ? '[모두절차]' : e.block === 'closing' ? '[결심]'
      : exam?.kind === 'witness' ? `[증인신문 · ${examineeName(exam)}]` : '[피고인신문]';
    const key = `${e.block}:${e.examIndex}`;
    if (key !== section) {
      if (out.length) out.push('');
      out.push(head);
      section = key;
    }
    out.push(`${speakerLabel(e.line.speaker, exam)}: ${e.line.text}`);
  }
  return out.join('\n');
}

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
  const transcriptBody = h('div', { class: 'doc-body transcript', 'data-doc-id': 'transcript', testid: 'doc-transcript' });
  const transcript = h('article', { class: 'doc' }, h('h3', {}, '공판조서'),
    h('p', { class: 'muted small' }, '법정에서 오간 진술의 요지입니다.'), transcriptBody);
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
    h('h2', {}, '기록'),
    ...sections,
    transcript,
    h('div', { class: 'toolbar' }, hl, hint),
    h('h3', {}, '형광펜'),
    list,
  );
  let last: GameState['highlights'] | null = null;
  let lastHeard: GameState['heard'] | null = null;
  let lastShowT = false;
  return {
    el,
    render(s, sc) {
      const showT = showTranscript(s);
      if (s.highlights === last && (!showT || s.heard === lastHeard) && showT === lastShowT) return;
      last = s.highlights;
      lastHeard = s.heard;
      lastShowT = showT;
      for (const d of DOCS) {
        const marks = s.highlights.filter((x) => x.docId === d.id).map((x) => x.text);
        bodies.get(d.id)!.replaceChildren(...markedText(sc.documents[d.id], marks));
      }
      transcript.hidden = !showT;
      if (showT) {
        // 결심 중 형광펜(최후진술)도 조서에 같이 표시한다.
        const marks = s.highlights.filter((x) => x.docId === 'transcript' || x.docId === 'closing').map((x) => x.text);
        transcriptBody.replaceChildren(...markedText(transcriptText(sc, s), marks));
      }
      const title = (id: string) => HL_TITLES[id] ?? id;
      list.replaceChildren(
        ...(s.highlights.length
          ? s.highlights.map((x) => h('li', {}, h('span', { class: 'hl-src' }, title(x.docId)), ` ${x.text}`))
          : [h('li', { class: 'muted' }, '아직 표시한 문장이 없습니다.')]),
      );
    },
  };
}
