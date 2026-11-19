// HTML 오버레이: 단계에 따라 패널을 전환하고, 기록·증거목록을 옆 탭(서랍)으로 연다.
import type { Controller } from '../game/controller';
import type { Scenario } from '../engine/scenario/schema';
import { PHASES, type GameState, type Phase } from '../engine/state';
import { button, h, show } from './dom';
import { createDialoguePanel } from './panels/dialogue';
import { createDocketPanel } from './panels/docket';
import { createDocsPanel } from './panels/docs';
import { createEvidencePanel } from './panels/evidence';
import { createPlaceholderPanel } from './panels/placeholder';
import type { Panel } from './panels/types';

export type { Panel } from './panels/types';

const PHASE_TITLES: Record<Phase, string> = {
  docket: '사건 대기열', pretrial: '공판 전 기록 검토', opening: '모두절차', evidence: '증거조사',
  exam: '신문', closing: '결심', review: '선고기일 전 재검토', verdict: '유무죄 판단', sentencing: '양형',
  judgment: '판결서', pronounce: '선고', appeal: '항소', record: '판결 기록실',
};
const at = (p: Phase, from: Phase) => PHASES.indexOf(p) >= PHASES.indexOf(from);
const isJudgmentStage = (p: Phase) => at(p, 'verdict');

type Drawer = 'docs' | 'evidence' | null;

function phaseTitle(c: Controller, s: GameState): string {
  const exam = c.currentExam();
  if (!exam) return PHASE_TITLES[s.phase];
  const base = exam.kind === 'witness' ? `증인신문 · ${c.speakerName('witness')}` : '피고인신문';
  return s.cursor.inSupp ? `${base} · 보충신문` : base;
}

export function mountOverlay(root: HTMLElement, c: Controller, sc: Scenario): void {
  const docket = createDocketPanel(c);
  const docs = createDocsPanel(c);
  const evidence = createEvidencePanel();
  const dialogue = createDialoguePanel(c);
  const placeholder = createPlaceholderPanel();
  const panels: Panel[] = [docket, docs, evidence, dialogue, placeholder];

  let drawer: Drawer = null;
  let lastPhase: Phase | null = null;
  const toggle = (d: Exclude<Drawer, null>) => {
    drawer = drawer === d ? null : d;
    render(c.state);
  };
  const title = h('div', { class: 'phase-title', testid: 'phase-title' });
  const tabDocs = button('tab-docs', '기록', () => toggle('docs'), 'tab');
  const tabEvidence = button('tab-evidence', '증거목록', () => toggle('evidence'), 'tab');
  const topbar = h('header', { class: 'topbar' }, title, h('nav', { class: 'tabs' }, tabDocs, tabEvidence));
  const drawerEl = h('div', { class: 'drawer', testid: 'drawer' }, docs.el, evidence.el);
  docket.el.classList.add('main');
  placeholder.el.classList.add('main');
  root.append(topbar, docket.el, placeholder.el, drawerEl, dialogue.el);

  function render(s: GameState): void {
    if (s.phase !== lastPhase) {
      // 단계에 들어설 때 그 단계의 주 패널을 서랍으로 연다.
      if (s.phase === 'pretrial') drawer = 'docs';
      else if (s.phase === 'evidence') drawer = 'evidence';
      else if (s.phase === 'opening' || s.phase === 'exam' || isJudgmentStage(s.phase)) drawer = null;
      lastPhase = s.phase;
    }
    const docsOk = at(s.phase, 'pretrial') && !isJudgmentStage(s.phase);
    const evOk = at(s.phase, 'evidence') && !isJudgmentStage(s.phase);
    if ((drawer === 'docs' && !docsOk) || (drawer === 'evidence' && !evOk)) drawer = null;

    title.textContent = phaseTitle(c, s);
    show(topbar, s.phase !== 'docket');
    show(tabDocs, docsOk);
    show(tabEvidence, evOk);
    tabDocs.classList.toggle('active', drawer === 'docs');
    tabEvidence.classList.toggle('active', drawer === 'evidence');
    show(docket.el, s.phase === 'docket');
    show(placeholder.el, isJudgmentStage(s.phase));
    show(dialogue.el, s.phase !== 'docket' && !isJudgmentStage(s.phase));
    show(drawerEl, drawer !== null);
    show(docs.el, drawer === 'docs');
    show(evidence.el, drawer === 'evidence');
    for (const p of panels) p.render(s, sc);
  }

  c.subscribe(render);
  render(c.state);

  // Space/Enter = [다음]. 버튼에 포커스가 있으면 브라우저 기본 동작(클릭)에 맡긴다.
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('button, input, textarea, select, [contenteditable]')) return;
    const next = root.querySelector<HTMLButtonElement>('[data-testid="btn-next"]');
    if (!next || next.closest('[hidden]') || next.disabled) return;
    e.preventDefault();
    next.click();
  });
}
