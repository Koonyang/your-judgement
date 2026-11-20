// 판결서 작성: 왼쪽은 빈 판결서. 누를 때마다 다음 항목(주문 → 범죄사실 → 증거의 요지 → 법령의 적용 → 양형의 이유)이
// 순서대로 나타나고, 오른쪽 도구가 그 항목을 채우는 것으로 바뀐다. 이미 쓴 항목을 누르면 그 도구로 돌아간다. 양형 단계(저울질 뒤)에서 시작하고, 무죄면 판결서 단계에서 바로 연다.
// [판결서 확정] = (양형 단계면) CONFIRM_SENTENCING → CONFIRM_JUDGMENT.
// 1화(tutorial): 여유폭 밖이면 참여관 한 줄만 보이고 이탈 슬롯은 숨긴다. 그 외 회차는 이탈 슬롯(양형 인자)을 연다.
import type { Controller } from '../../game/controller';
import { verdictOf } from '../../engine/board';
import { SUSPENSION_PERIOD_YEARS } from '../../engine/config';
import { assembleJudgment, formatSentence } from '../../engine/judgment';
import { scaleView } from '../../engine/scale';
import type { Scenario } from '../../engine/scenario/schema';
import { availableFactors, leeway, validateSentence } from '../../engine/sentencing';
import type { GameState } from '../../engine/state';
import { button, h, show } from '../dom';
import { createDnd } from '../drag';
import { recordBasis, sameBasis, selectedBasis } from '../sentencingBasis';
import { createRangeBar, scaleMaxOf } from './rangebar';
import { areaText, calcLines, SUSP_LABEL } from './sentencing';
import type { Panel } from './types';

type Key = 'evidenceSlots' | 'deviationSlots';
type SecId = 'order' | 'facts' | 'evidence' | 'law' | 'reasons' | 'acquit';
const ADDENDUM_MAX = 80;
const TITLES: Record<SecId, string> = {
  order: '주    문', facts: '범죄사실', evidence: '증거의 요지', law: '법령의 적용', reasons: '양형의 이유', acquit: '무죄 이유',
};

export function createJudgmentPanel(c: Controller, backToScale: () => void): Panel {
  const dnd = createDnd();
  const el = h('section', { class: 'panel stage judgment', testid: 'panel-judgment' });
  const doc = h('div', { class: 'judgment-doc', testid: 'judgment-preview' });
  const tool = h('div', { class: 'tool', testid: 'judgment-tool' });
  const back = button('btn-scale-back', '다시 저울질', () => backToScale(), 'btn');
  const confirm = button('btn-confirm-judgment', '판결서 확정', () => {
    if (c.state.phase === 'sentencing') {
      c.dispatch({ type: 'CONFIRM_SENTENCING' });
      if (c.state.phase === 'sentencing') return open('order'); // 형이 정해지지 않았으면 주문으로
    }
    c.dispatch({ type: 'CONFIRM_JUDGMENT' });
  }, 'btn primary');
  el.append(h('h2', {}, '판결서'), h('div', { class: 'write-grid' }, doc, h('div', { class: 'tool-col' }, tool, h('div', { class: 'stage-foot' }, back, confirm))));

  // ── 오른쪽 도구들: 처음 한 번 만들고 내용만 갱신한다(슬라이더를 끄는 중에 원소가 바뀌지 않게) ──
  // 주문: 권고 막대 위 스크롤로 형량, −/+로 1개월씩, 집행유예, 참고
  const orderLine = h('p', { class: 'order-line', testid: 'order-line' });
  const bar = createRangeBar('judgment-bar');
  const slider = h('input', { type: 'range', min: '1', step: '1', testid: 'input-months', class: 'months-slider', 'aria-label': '징역 개월 수' });
  slider.addEventListener('input', () => c.dispatch({ type: 'SET_SENTENCING', patch: { months: Number(slider.value) } }));
  const step = (d: number) => () => {
    const m = c.state.sentencing.months ?? 1;
    c.dispatch({ type: 'SET_SENTENCING', patch: { months: Math.max(1, Math.min(c.sc.sentencing.statutoryMaxMonths, m + d)) } });
  };
  const dec = button('btn-months-dec', '− 1개월', step(-1), 'btn sm');
  const inc = button('btn-months-inc', '+ 1개월', step(1), 'btn sm');
  const suspended = h('input', { type: 'checkbox', testid: 'chk-suspended' });
  suspended.addEventListener('change', () => c.dispatch({ type: 'SET_SENTENCING', patch: { suspended: suspended.checked } }));
  const error = h('div', { class: 'error', testid: 'sentence-error', role: 'alert' });
  const clerk = h('p', { class: 'clerk-note', testid: 'judgment-clerk-note' }, '참여관: 양형기준을 벗어나면 판결서에 이유를 적어야 합니다.');
  const area = h('span', { class: 'area', testid: 'sentencing-area' });
  const susRec = h('span', { class: 'susp-rec', testid: 'susp-recommendation' });
  const selected = h('p', { class: 'muted small selected-basis', testid: 'selected-basis' });
  const calc = h('div', { class: 'calc-lines', testid: 'calc-lines' });
  const orderTool = h('div', { class: 'tool-body', testid: 'tool-order' },
    h('h3', {}, '주문: 형을 정한다'), orderLine,
    h('div', { class: 'scroll' }, bar.el, slider),
    h('div', { class: 'stepper' }, dec, inc),
    h('label', { class: 'check' }, suspended, h('span', {}, `집행유예 (${SUSPENSION_PERIOD_YEARS}년)`)), error, clerk,
    h('h3', {}, '참고'), h('p', { class: 'ref-line' }, '기록상 권고(항소심 기준) ', area, ' · 집행유예 ', susRec), selected, calc);

  // 증거의 요지: 증거 카드를 끼운다(누르기·끌어다 놓기)
  const evidenceBox = h('div', { class: 'chips' });
  const evidenceTool = h('div', { class: 'tool-body', testid: 'tool-evidence' },
    h('h3', {}, '증거의 요지: 유죄의 근거'), h('p', { class: 'muted small' }, '증거 카드를 누르거나 왼쪽 「증거의 요지」에 끌어다 놓습니다.'), evidenceBox);

  // 양형의 이유: 천칭에서 정한 유리/불리 + [추가로] + (회차에 따라) 이탈 사유
  const addendum = h('input', { type: 'text', maxlength: String(ADDENDUM_MAX), testid: 'input-addendum', class: 'text-input', placeholder: '(선택) 양형의 이유 끝에 덧붙일 한 문장' });
  addendum.addEventListener('input', () => c.dispatch({ type: 'SET_JUDGMENT', patch: { addendum: addendum.value.trim() === '' ? '' : addendum.value } }));
  const devBox = h('div', { class: 'chips', testid: 'drop-deviation' });
  const devSec = h('div', {}, h('h3', {}, '이탈 사유'), h('p', { class: 'muted small' }, '권고범위와 여유폭을 넘어선 형의 근거가 될 양형 인자를 끼웁니다.'), devBox);
  const reasonsNote = h('p', { class: 'muted small' }, '유리한 정상·불리한 정상은 천칭에 올린 그대로 적힙니다. 바꾸려면 [다시 저울질].');
  const reasonsTool = h('div', { class: 'tool-body', testid: 'tool-reasons' },
    h('h3', {}, '양형의 이유'), reasonsNote,
    h('h3', {}, '[추가로]'), addendum,
    h('p', { class: 'muted small' }, '쓰면 권고범위 경계값의 ±20%까지 정당한 재량으로 봅니다. 문구는 선고 때 낭독되고 기록실에 남습니다.'), devSec);
  const autoTool = h('div', { class: 'tool-body', testid: 'tool-auto' });
  const hint = h('div', { class: 'tool-body muted', testid: 'tool-hint' }, '왼쪽 판결서의 항목을 누르면 그 문단이 나타나고, 여기서 채웁니다.');
  tool.append(hint, orderTool, evidenceTool, reasonsTool, autoTool);

  // ── 상태 ──
  let opened = new Set<SecId>();
  let active: SecId | null = null;
  let writing = false;
  const open = (id: SecId) => {
    opened.add(id);
    active = id;
    draw(c.state, c.sc);
  };

  const toggle = (key: Key, id: string) => {
    const j = c.state.judgment;
    c.dispatch({ type: 'SET_JUDGMENT', patch: { [key]: j[key].includes(id) ? j[key].filter((x) => x !== id) : [...j[key], id] } });
  };
  const add = (key: Key, id: string) => { if (!c.state.judgment[key].includes(id)) toggle(key, id); };
  dnd.target(devBox, (id) => add('deviationSlots', id));
  const chip = (testid: string, label: string, on: boolean, onClick: () => void) => {
    const b = button(testid, label, onClick, 'btn chip');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    return b;
  };

  const order = (guilty: boolean): SecId[] => (guilty ? ['order', 'facts', 'evidence', 'law', 'reasons'] : ['order', 'facts', 'acquit']);
  // 판결서의 빈 곳을 눌러도 다음 항목이 나온다.
  doc.addEventListener('click', () => {
    const next = order(verdictOf(c.state.board) === 'guilty').find((x) => !opened.has(x));
    if (next) open(next);
  });

  function drawDoc(s: GameState, sc: Scenario, guilty: boolean) {
    const d = assembleJudgment(sc, s);
    const list = (xs: string[], empty: string) =>
      xs.length ? h('ol', {}, ...xs.map((x) => h('li', {}, x))) : h('p', { class: 'muted small' }, empty);
    const body: Record<SecId, () => (Node | string)[]> = {
      order: () => d.order.map((x) => h('p', {}, x)),
      facts: () => [h('p', {}, d.facts)],
      evidence: () => [list(d.evidenceSummary, '(아직 끼운 증거가 없습니다)')],
      law: () => [h('p', {}, d.lawApplied)],
      reasons: () => [
        h('div', { class: 'jd-sub' }, '유리한 정상'), list(d.sentencingReasons.favorable, '(없음)'),
        h('div', { class: 'jd-sub' }, '불리한 정상'), list(d.sentencingReasons.unfavorable, '(없음)'),
        ...(d.sentencingReasons.addendum ? [h('p', { class: 'jd-add' }, d.sentencingReasons.addendum)] : [])],
      acquit: () => [list(d.acquittalReasons ?? [], '의심 남은 칸이 없습니다.'),
        ...(d.sentencingReasons.addendum ? [h('p', { class: 'jd-add' }, d.sentencingReasons.addendum)] : [])],
    };
    const ids = order(guilty);
    const next = ids.find((x) => !opened.has(x));
    doc.replaceChildren(h('div', { class: 'jd-title' }, '판   결'), ...ids.map((id) => {
      const shown = opened.has(id);
      const sec = h('div', { class: `jd-sec${shown ? ' shown' : ''}${active === id ? ' active' : ''}`, testid: `sec-${id}`, role: 'button', tabindex: '0' },
        h('div', { class: 'jd-h' }, id === 'facts' && !guilty ? '공소사실' : TITLES[id]),
        ...(shown ? body[id]() : [h('p', { class: 'jd-blank' }, id === next ? '눌러서 작성' : '')]));
      // 쓴 항목은 다시 열고, 아직 안 쓴 항목은 어디를 눌러도 순서상 다음 항목이 나온다.
      const go = () => open(shown ? id : (next ?? id));
      sec.addEventListener('click', (e) => { e.stopPropagation(); go(); });
      sec.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      if (id === 'evidence') {
        dnd.target(sec, (cardId) => { opened.add('evidence'); active = 'evidence'; add('evidenceSlots', cardId); });
      }
      return sec;
    }));
  }

  function draw(s: GameState, sc: Scenario) {
    const guilty = verdictOf(s.board) === 'guilty';
    const j = s.judgment;
    show(back, guilty && s.phase === 'sentencing');
    drawDoc(s, sc, guilty);

    show(hint, active === null);
    show(orderTool, active === 'order' && guilty);
    show(evidenceTool, active === 'evidence');
    show(reasonsTool, active === 'reasons' || active === 'acquit');
    show(autoTool, (active === 'facts' || active === 'law') || (active === 'order' && !guilty));
    autoTool.textContent = active === 'facts' ? '범죄사실은 공소장의 공소사실을 그대로 옮깁니다.'
      : active === 'law' ? '법령의 적용은 판단에 따라 자동으로 적힙니다.' : '무죄 판결의 주문입니다.';

    // 주문
    const months = s.sentencing.months;
    const err = months === null ? '형을 정하십시오.' : validateSentence({ months, suspended: s.sentencing.suspended }, sc.sentencing.statutoryMaxMonths);
    if (guilty) {
      const rr = recordBasis(sc, s);
      const scaleMax = scaleMaxOf(sc.sentencing.ranges.aggravated.max, sc.closing.demandMonths, months);
      slider.max = String(scaleMax);
      if (document.activeElement !== slider && months !== null && slider.value !== String(months)) slider.value = String(months);
      orderLine.textContent = months === null ? '피고인을 징역 (     )에 처한다.' : `피고인을 ${formatSentence(months)}에 처한다.${s.sentencing.suspended ? ' (집행유예)' : ''}`;
      const lw = leeway(rr.range, j.addendum !== '');
      bar.update({ range: rr.range, leeway: j.addendum !== '' ? lw : null, demand: sc.closing.demandMonths, months, scaleMax });
      suspended.checked = s.sentencing.suspended;
      error.textContent = months === null ? '' : (err ?? '');
      const outside = months !== null && (months < lw.min || months > lw.max);
      show(clerk, outside && sc.meta.tutorial);
      show(devSec, outside && !sc.meta.tutorial);
      if (outside && !sc.meta.tutorial) {
        devBox.replaceChildren(...availableFactors(sc.sentencing.factors, new Set(s.heldCards)).map((f) => {
          const b = chip(`slot-dev-${f.id}`, f.name, j.deviationSlots.includes(f.id), () => toggle('deviationSlots', f.id));
          dnd.source(b, f.id, { outside: () => { if (c.state.judgment.deviationSlots.includes(f.id)) toggle('deviationSlots', f.id); } });
          return b;
        }));
      }
      area.textContent = `${areaText(rr)} ${rr.range.min}~${rr.range.max}개월${rr.judgmentCall ? ' · 종합 판단 필요' : ''}`;
      susRec.textContent = SUSP_LABEL[rr.susp];
      susRec.dataset.rec = rr.susp;
      const held = new Set(s.heldCards);
      const factors = availableFactors(sc.sentencing.factors, held).filter((f) => [...s.sentencing.special, ...s.sentencing.general].includes(f.id));
      const susp = availableFactors(sc.sentencing.suspensionFactors, held).filter((f) => s.sentencing.susp.includes(f.id));
      calc.replaceChildren(...Object.values(calcLines(scaleView(sc.sentencing, factors, susp))).map((t) => h('div', { class: 'calc' }, t)));
      const sel = selectedBasis(sc, s);
      const differs = !sameBasis(sel, rr);
      show(selected, differs);
      selected.textContent = differs ? `천칭 기준은 ${areaText(sel)} ${sel.range.min}~${sel.range.max}개월. 기록에 근거가 있는 카드는 항소심이 모두 봅니다.` : '';
    }

    // 증거의 요지
    evidenceBox.replaceChildren(...sc.cards.filter((x) => x.kind === 'evidence' && s.heldCards.includes(x.id)).map((x) => {
      const b = chip(`slot-evidence-${x.id}`, x.title, j.evidenceSlots.includes(x.id), () => toggle('evidenceSlots', x.id));
      dnd.source(b, x.id); // 카드 목록은 슬롯이 아니므로 밖에 놓아도 빼지 않는다(빼기는 클릭)
      return b;
    }));

    if (document.activeElement !== addendum && addendum.value !== j.addendum) addendum.value = j.addendum;
    // 마지막 항목까지 써야 확정할 수 있다.
    confirm.disabled = order(guilty).some((x) => !opened.has(x));
  }

  return {
    el,
    render(s, sc) {
      const now = s.phase === 'judgment' || s.phase === 'sentencing';
      if (!now) { writing = false; return; }
      if (!writing) { opened = new Set(); active = null; writing = true; } // 새로 쓰기 시작
      draw(s, sc);
    },
  };
}
