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
const COURT_PHASES = new Set<Phase>(['opening', 'evidence', 'exam', 'closing']);
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
  // 양형: 저울질(AR) → [저울질을 마친다] → 판결서 작성(judgment 패널, 양형 단계에서 시작).
  const sentencing = createSentencingPanel(c, () => render(c.state));
  const judgment = createJudgmentPanel(c, () => sentencing.setWeighing(true));
  const result = createResultPanel(c);
  const record = createRecordPanel();
  const panels: Panel[] = [docket, docs, evidence, boardDrawer, dialogue, boardMain, boardIntro, sentencing, judgment, result, record];

  let drawer: Drawer = null;
  let lastPhase: Phase | null = null;
  /** 쟁점 보드를 처음 열 때(서랍이든 판단 단계든) 한 번 튜토리얼을 보여 준다(읽기 전용, [확인]). UI 전용 상태. */
  let introOpen = false;
  let introSeen = false;
  const showIntro = () => { if (!introSeen) introOpen = introSeen = true; };
  const toggle = (d: Exclude<Drawer, null>) => {
    if (leaving) return;
    if (drawer === d) return putDown();
    if (d === 'board') showIntro();
    drawer = d;
    render(c.state);
  };
  const desk = createDesk();
  const title = desk.plate;
  const items: Record<Exclude<Drawer, null>, DeskItem> = {
    docs: { id: 'docs', testid: 'tab-docs', label: '기록', kind: 'pile', open: () => toggle('docs') },
    evidence: { id: 'evidence', testid: 'tab-evidence', label: '증거목록', kind: 'paper', open: () => toggle('evidence') },
    board: { id: 'board', testid: 'tab-board', label: '쟁점 보드', kind: 'memo', open: () => toggle('board') },
  };
  const dim = h('div', { class: 'zoom-dim' });
  // 마이크: 재판장이 법정 인물에게 하는 발언은 전부 여기로(제지·필수 발언). 지금 할 수 있는 발언이 하나면 바로, 여럿이면 목록.
  const say = h('div', { class: 'mic-say', testid: 'judge-say' }, '재판장: 잠깐.');
  say.hidden = true;
  let sayTimer = 0;
  type Speech = { id: string; label: string; run: () => void };
  const interruptSpeech: Speech = {
    id: 'interrupt', label: '제지',
    run: () => {
      c.dispatch({ type: 'INTERRUPT' });
      say.hidden = false;
      const btn = root.querySelector('[data-testid="btn-mic"]');
      btn?.classList.add('on'); // 표시등이 켜진다
      clearTimeout(sayTimer);
      sayTimer = window.setTimeout(() => { say.hidden = true; btn?.classList.remove('on'); }, 900);
    },
  };
  let speeches: Speech[] = [];
  const micMenu = h('div', { class: 'mic-menu', testid: 'mic-menu' });
  micMenu.hidden = true;
  const mic: DeskItem = {
    id: 'mic', testid: 'btn-mic', label: '마이크', kind: 'mic',
    open: () => {
      if (speeches.length === 1) return speeches[0].run();
      micMenu.replaceChildren(...speeches.map((sp) => button(`btn-speak-${sp.id}`, sp.label, () => { micMenu.hidden = true; sp.run(); }, 'btn sm')));
      micMenu.hidden = !micMenu.hidden;
    },
  };
  // 내려놓기: 서류가 책상으로 내려가는 애니메이션이 끝난 뒤 닫는다(움직임 줄이기 설정이면 바로).
  let leaving = 0;
  const putDown = () => {
    if (leaving || drawer === null) return;
    const done = () => { leaving = 0; drawerEl.classList.remove('leaving'); drawer = null; render(c.state); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    drawerEl.classList.add('leaving');
    leaving = window.setTimeout(done, 220);
  };
  const close = button('btn-zoom-close', '내려놓기', putDown, 'btn zoom-close');
  const drawerEl = h('div', { class: 'drawer', testid: 'drawer' }, docs.el, evidence.el, boardDrawer.el, close);
  dim.addEventListener('click', () => { if (drawer !== null) putDown(); }); // 확대 서류 바깥을 누르면 내려놓는다
  const introOk = button('btn-board-intro-ok', '확인', () => {
    introOpen = false;
    render(c.state);
  }, 'btn primary');
  const intro = h('div', { class: 'modal', testid: 'board-intro' }, h('div', { class: 'modal-box' }, boardIntro.el, h('div', { class: 'stage-foot' }, introOk)));
  const skip = button('btn-skip-pronounce', '건너뛰기', () => c.dispatch({ type: 'FINISH_PRONOUNCE' }), 'btn skip');
  docket.el.classList.add('main');
  boardMain.el.classList.add('stage');
  root.append(desk.el, say, micMenu, dim, docket.el, boardMain.el, sentencing.el, judgment.el, result.el, record.el, drawerEl, dialogue.el, intro, skip);

  function enter(s: GameState): void {
    // 단계에 들어설 때 그 단계의 주 패널을 서랍으로 연다.
    if (s.phase === 'pretrial') drawer = 'docs';
    else if (s.phase === 'evidence') drawer = 'evidence';
    else if (s.phase === 'opening' || s.phase === 'exam' || isJudgmentStage(s.phase)) drawer = null;
    if (s.phase === 'verdict') showIntro();
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
    const modal = introOpen && (drawer === 'board' || s.phase === 'verdict');
    // 쟁점 보드 회상: 보드·판단 화면을 잠시 걷고 그 증언 장면(법정 + 대사 줄)을 다시 보여 준다.
    const recall = c.recalling;
    document.documentElement.classList.toggle('recall', recall);

    title.textContent = phaseTitle(c, s);
    show(title, s.phase !== 'docket' && s.phase !== 'pronounce');
    show(desk.el, s.phase !== 'pronounce'); // 선고 연출은 Phaser 화면 전체를 쓴다
    root.classList.toggle('chambers', !COURT_PHASES.has(s.phase) && s.phase !== 'pronounce' && !recall); // 판사실: 책상 띠 없이 방 안의 책상
    // 마이크는 증인·피고인 신문 중(보충신문 제외)에만. 재판장 자신이 말할 때는 누를 수 없다.
    const line = c.shownLine();
    const live = !c.replaying && !s.cursor.inSupp && line ? line : null;
    const micOn = !!live && (s.phase === 'opening' || s.phase === 'exam' || s.phase === 'closing');
    // 필수 발언 줄에서는 그 발언만. 제지는 신문 중 재판장·독백이 아닌 줄에서. 표시등은 필수 발언에만 켠다(제지 타이밍은 알려 주지 않는다).
    const sp = live?.speak;
    speeches = !micOn ? []
      : sp ? [{ id: sp.id, label: sp.label, run: () => c.dispatch({ type: 'SPEAK', speakId: sp.id }) }]
      : s.phase === 'exam' && live!.speaker !== 'judge' && live!.speaker !== 'thought' ? [interruptSpeech] : [];
    mic.disabled = !speeches.length;
    mic.attention = !!sp;
    micMenu.hidden = true;
    desk.setItems([...(boardOk ? [items.board] : []), ...(docsOk ? [items.docs] : []), ...(evOk ? [items.evidence] : []), ...(micOn ? [mic] : [])], drawer);
    show(docket.el, s.phase === 'docket');
    show(boardMain.el, s.phase === 'verdict' && !recall);
    const weighing = s.phase === 'sentencing' && sentencing.weighing();
    show(sentencing.el, weighing);
    show(judgment.el, s.phase === 'judgment' || (s.phase === 'sentencing' && !weighing));
    show(result.el, s.phase === 'appeal');
    show(record.el, s.phase === 'record');
    show(skip, s.phase === 'pronounce');
    show(intro, modal);
    show(dialogue.el, recall || (s.phase !== 'docket' && !isJudgmentStage(s.phase) && !modal));
    show(drawerEl, drawer !== null && !modal && !recall);
    show(docs.el, drawer === 'docs');
    show(evidence.el, drawer === 'evidence');
    show(boardDrawer.el, drawer === 'board');
    const stageOpen = !recall && (s.phase === 'docket' || s.phase === 'verdict' || s.phase === 'sentencing' || s.phase === 'judgment'
      || s.phase === 'appeal' || s.phase === 'record');
    const drawerOpen = drawer !== null && !modal && !recall;
    const dialogueOn = !dialogue.el.hidden;
    // 확대 보기가 열리면 대사 줄은 맨 아래로 내려가고(y310–360) 확대 서류가 그 위를 쓴다.
    root.classList.toggle('zoomed', stageOpen || drawerOpen || modal);
    root.classList.toggle('dl-on', dialogueOn);
    // 판결 단계 밖에서 집어 든 서류는 작은 종이로: 위로 법정이 보이게 한다. 양형은 허공에 뜬 숙고(AR).
    root.classList.toggle('paper', !stageOpen && drawerOpen && drawer !== 'board');
    // 쟁점 보드는 법정과 분리된 머릿속 화면: 법정·책상을 가리고 보드만(판단 단계의 보드도 같은 화면).
    root.classList.toggle('board-screen', (drawerOpen && drawer === 'board') || (s.phase === 'verdict' && !recall) || modal);
    root.classList.toggle('ar', s.phase === 'sentencing' && sentencing.weighing());
    show(dim, root.classList.contains('zoomed'));
    for (const p of panels) p.render(s, sc);
  }

  c.subscribe(render);
  render(c.state);

  // Space/Enter = [다음]. 버튼에 포커스가 있으면 브라우저 기본 동작(클릭)에 맡긴다.
  // 화면 아무 데나 누르면 [다음]: [다음]이 ▼(터치로 넘기는 상태)일 때만. 대사 줄뿐 아니라 "모두절차를 마칩니다." 같은
  // 블록 끝 안내도 포함한다. 절차를 바꾸는 글자 버튼(공판 개정 등)과 선택지·버튼·서류를 누른 경우는 제외.
  window.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || t.closest('button, a, input, label, select, textarea, .panel, .drawer, .modal, .supp, .zoom-dim, .desk-item, .drag-source, .drop-target')) return;
    const next = root.querySelector<HTMLButtonElement>('[data-testid="btn-next"]');
    if (!next || !next.classList.contains('tap') || next.closest('[hidden]') || next.disabled) return;
    next.click();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('button, input, textarea, select, [contenteditable], [role="button"]')) return;
    const next = root.querySelector<HTMLButtonElement>('[data-testid="btn-next"]');
    if (!next || next.closest('[hidden]') || next.disabled) return;
    e.preventDefault();
    next.click();
  });
}
