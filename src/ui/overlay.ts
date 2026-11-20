// HTML 오버레이: 대사 줄 + 책상. 단계 주 패널과 책상에서 집어 든 서류(기록·증거목록·쟁점 보드)는 확대 보기로 연다.
import type { Controller } from '../game/controller';
import { toRecordEntry } from '../engine/record';
import type { Scenario } from '../engine/scenario/schema';
import { PHASES, type GameState, type Phase } from '../engine/state';
import { button, h, show } from './dom';
import { createBoardPanel } from './panels/board';
import { createDialoguePanel } from './panels/dialogue';
import { createDocketPanel } from './panels/docket';
import { createDocsPanel } from './panels/docs';
import { createEvidencePanel } from './panels/evidence';
import { createJudgmentPanel } from './panels/judgment';
import { createRecordPanel } from './panels/record';
import { createResultPanel } from './panels/result';
import { createSentencingPanel } from './panels/sentencing';
import type { Panel } from './panels/types';
import { loadRecords, saveRecord } from './storage';
import { createDesk, type DeskItem } from './desk';

export type { Panel } from './panels/types';

const PHASE_TITLES: Record<Phase, string> = {
  docket: '사건 대기열', pretrial: '공판 전 기록 검토', opening: '모두절차', evidence: '증거조사',
  exam: '신문', closing: '결심', review: '선고기일 전 재검토', verdict: '유무죄 판단', sentencing: '양형',
  judgment: '판결서', pronounce: '선고', appeal: '항소', record: '판결 기록실',
};
const idx = (p: Phase) => PHASES.indexOf(p);
const at = (p: Phase, from: Phase) => idx(p) >= idx(from);
const isJudgmentStage = (p: Phase) => at(p, 'verdict');

type Drawer = 'docs' | 'evidence' | 'board' | null;

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
  const boardDrawer = createBoardPanel(c, 'drawer');
  const dialogue = createDialoguePanel(c);
  const boardMain = createBoardPanel(c, 'main');
  const boardIntro = createBoardPanel(c, 'readonly');
  const sentencing = createSentencingPanel(c);
  const judgment = createJudgmentPanel(c);
  const result = createResultPanel(c);
  const record = createRecordPanel();
  const panels: Panel[] = [docket, docs, evidence, boardDrawer, dialogue, boardMain, boardIntro, sentencing, judgment, result, record];

  let drawer: Drawer = null;
  let lastPhase: Phase | null = null;
  /** 모두절차가 끝나면 자동 생성된 쟁점 보드를 한 번 보여 준다(읽기 전용, [확인]). UI 전용 상태. */
  let introOpen = false;
  const toggle = (d: Exclude<Drawer, null>) => {
    drawer = drawer === d ? null : d;
    render(c.state);
  };
  const desk = createDesk();
  const title = desk.plate;
  const items: Record<Exclude<Drawer, null>, DeskItem> = {
    docs: { id: 'docs', testid: 'tab-docs', label: '기록', kind: 'pile', open: () => toggle('docs') },
    evidence: { id: 'evidence', testid: 'tab-evidence', label: '증거목록', kind: 'paper', open: () => toggle('evidence') },
    board: { id: 'board', testid: 'tab-board', label: '쟁점 메모', kind: 'memo', open: () => toggle('board') },
  };
  const dim = h('div', { class: 'zoom-dim' });
  const drawerEl = h('div', { class: 'drawer', testid: 'drawer' }, docs.el, evidence.el, boardDrawer.el);
  const introOk = button('btn-board-intro-ok', '확인', () => {
    introOpen = false;
    render(c.state);
  }, 'btn primary');
  const intro = h('div', { class: 'modal', testid: 'board-intro' }, h('div', { class: 'modal-box' }, boardIntro.el, h('div', { class: 'stage-foot' }, introOk)));
  const skip = button('btn-skip-pronounce', '건너뛰기', () => c.dispatch({ type: 'FINISH_PRONOUNCE' }), 'btn skip');
  docket.el.classList.add('main');
  boardMain.el.classList.add('stage');
  root.append(desk.el, dim, docket.el, boardMain.el, sentencing.el, judgment.el, result.el, record.el, drawerEl, dialogue.el, intro, skip);

  function enter(s: GameState): void {
    // 단계에 들어설 때 그 단계의 주 패널을 서랍으로 연다.
    if (s.phase === 'pretrial') drawer = 'docs';
    else if (s.phase === 'evidence') drawer = 'evidence';
    else if (s.phase === 'opening' || s.phase === 'exam' || isJudgmentStage(s.phase)) drawer = null;
    if (s.phase === 'evidence' && lastPhase === 'opening') introOpen = true;
    if (s.phase === 'record') {
      const o = c.appealOutcome;
      if (o) {
        const previous = loadRecords();
        const entry = toRecordEntry(sc, s, o);
        record.setEntries(entry, previous, saveRecord(entry));
      }
    }
    lastPhase = s.phase;
  }

  function render(s: GameState): void {
    if (s.phase !== lastPhase) enter(s);
    // 기록·증거목록은 유무죄 판단 때까지 참고용으로 열 수 있다. 쟁점 보드 서랍은 판단 전 심리 중에만.
    const docsOk = at(s.phase, 'pretrial') && idx(s.phase) <= idx('verdict');
    const evOk = at(s.phase, 'evidence') && idx(s.phase) <= idx('verdict');
    const boardOk = at(s.phase, 'evidence') && !isJudgmentStage(s.phase);
    if ((drawer === 'docs' && !docsOk) || (drawer === 'evidence' && !evOk) || (drawer === 'board' && !boardOk)) drawer = null;
    const modal = introOpen && s.phase === 'evidence';

    title.textContent = phaseTitle(c, s);
    show(title, s.phase !== 'docket' && s.phase !== 'pronounce');
    desk.setItems([...(boardOk ? [items.board] : []), ...(docsOk ? [items.docs] : []), ...(evOk ? [items.evidence] : [])], drawer);
    show(docket.el, s.phase === 'docket');
    show(boardMain.el, s.phase === 'verdict');
    show(sentencing.el, s.phase === 'sentencing');
    show(judgment.el, s.phase === 'judgment');
    show(result.el, s.phase === 'appeal');
    show(record.el, s.phase === 'record');
    show(skip, s.phase === 'pronounce');
    show(intro, modal);
    show(dialogue.el, s.phase !== 'docket' && !isJudgmentStage(s.phase) && !modal);
    show(drawerEl, drawer !== null && !modal);
    show(docs.el, drawer === 'docs');
    show(evidence.el, drawer === 'evidence');
    show(boardDrawer.el, drawer === 'board');
    const stageOpen = s.phase === 'docket' || s.phase === 'verdict' || s.phase === 'sentencing' || s.phase === 'judgment'
      || s.phase === 'appeal' || s.phase === 'record';
    const dialogueOn = !dialogue.el.hidden;
    // 확대 보기가 열리면 대사 줄은 맨 아래로 내려가고(y310–360) 확대 서류가 그 위를 쓴다.
    root.classList.toggle('zoomed', stageOpen || (drawer !== null && !modal) || modal);
    root.classList.toggle('dl-on', dialogueOn);
    show(dim, root.classList.contains('zoomed'));
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
