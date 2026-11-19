// 기록: 공소장·피고인 의견서(공판 전부터), 공판조서(선고기일 전 재검토부터). 문장을 골라 [형광펜]을 누르면 HIGHLIGHT.
//
// 공판조서는 근사치다: 엔진은 "들은 라인" 목록을 따로 남기지 않으므로, 모두절차·각 신문·결심 라인 중
// 현재 플래그로 `when`이 충족되는 것과 물어본 보충신문(질문·답변)을 시나리오 순서대로 나열한다.
// 제지로 끊은 라인도 `when`만 맞으면 들어갈 수 있다(표시 전용, 판정에 쓰지 않음).
import type { Controller } from '../../game/controller';
import { evalCond } from '../../engine/cond';
import { suppFlag } from '../../engine/reducer';
import type { Line, Scenario, Speaker } from '../../engine/scenario/schema';
import { PHASES, type GameState } from '../../engine/state';
import { button, h } from '../dom';
import type { Panel } from './types';

const DOCS = [
  { id: 'indictment', title: '공소장' },
  { id: 'defenseOpinion', title: '피고인 의견서' },
] as const;
const HL_TITLES: Record<string, string> = { indictment: '공소장', defenseOpinion: '피고인 의견서', closing: '최후진술', transcript: '공판조서' };
const SPEAKERS: Record<Speaker, string> = {
  judge: '재판장', clerk: '참여관', prosecutor: '검사', defense: '변호인', witness: '증인', defendant: '피고인',
};
const showTranscript = (s: GameState) => PHASES.indexOf(s.phase) >= PHASES.indexOf('review');

/** 공판조서(근사). 위 파일 머리 주석 참조. */
export function transcriptText(sc: Scenario, s: GameState): string {
  const flags = new Set(s.flags);
  const out: string[] = [];
  const say = (sp: Speaker, text: string, who?: string) => out.push(`${who ?? SPEAKERS[sp]}: ${text}`);
  const lines = (ls: Line[], who?: (sp: Speaker) => string | undefined) => {
    for (const l of ls) if (evalCond(l.when, flags)) say(l.speaker, l.text, who?.(l.speaker));
  };
  out.push('[모두절차]');
  lines(sc.opening);
  for (const ex of sc.exams) {
    const name = ex.name.replace(/\s*\(.*\)\s*$/, '');
    const who = (sp: Speaker) => ((sp === 'witness' && ex.kind === 'witness') || (sp === 'defendant' && ex.kind === 'defendant') ? name : undefined);
    out.push('', ex.kind === 'witness' ? `[증인신문 · ${name}]` : '[피고인신문]');
    lines(ex.lines, who);
    for (const q of ex.supplementary) {
      if (!flags.has(suppFlag(q.id))) continue;
      say('judge', q.text);
      lines(q.answer, who);
    }
  }
  out.push('', '[결심]');
  lines(sc.closing.lines);
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
  let lastFlags: GameState['flags'] | null = null;
  let lastShowT = false;
  return {
    el,
    render(s, sc) {
      const showT = showTranscript(s);
      if (s.highlights === last && (!showT || s.flags === lastFlags) && showT === lastShowT) return;
      last = s.highlights;
      lastFlags = s.flags;
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
