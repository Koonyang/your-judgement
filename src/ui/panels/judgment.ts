// 판결서 조립: 증거의 요지 슬롯(증거 카드), 양형의 이유 유리/불리한 정상 슬롯(양형 인자·양형 카드·형광펜 문장 `hl:<i>`),
// [추가로] 한 줄. 미리보기는 assembleJudgment 결과.
// 1화(tutorial): 여유폭 밖이면 참여관 한 줄만 보이고 이탈 슬롯은 숨긴다. 그 외 회차는 이탈 슬롯(양형 인자)을 연다.
import type { Controller } from '../../game/controller';
import { verdictOf } from '../../engine/board';
import { assembleJudgment, formatSentence } from '../../engine/judgment';
import type { Scenario } from '../../engine/scenario/schema';
import { availableFactors, leeway } from '../../engine/sentencing';
import type { GameState } from '../../engine/state';
import { button, h, show } from '../dom';
import { createRangeBar, scaleMaxOf } from './rangebar';
import { recordBasis } from '../sentencingBasis';
import { createDnd } from '../drag';
import { AREA_LABEL } from './sentencing';
import type { Panel } from './types';

type Key = 'evidenceSlots' | 'favorable' | 'unfavorable' | 'deviationSlots';
const ADDENDUM_MAX = 80;
const HL_SRC: Record<string, string> = { indictment: '공소장', defenseOpinion: '의견서', closing: '최후진술', transcript: '공판조서' };

const tid = (id: string) => id.replace(/:/g, '-');

export function createJudgmentPanel(c: Controller): Panel {
  const dnd = createDnd();
  const el = h('section', { class: 'panel stage judgment', testid: 'panel-judgment' });
  const evidenceBox = h('div', { class: 'chips' });
  const reasonsBox = h('div', { class: 'reason-rows' });
  const devBox = h('div', { class: 'chips', testid: 'drop-deviation' });
  const sentencingSec = h('div', {});
  const devSec = h('div', {}, h('h3', {}, '이탈 사유'), h('p', { class: 'muted small' }, '권고범위와 여유폭을 넘어선 형의 근거가 될 양형 인자를 끼웁니다.'), devBox);
  const clerk = h('p', { class: 'clerk-note', testid: 'judgment-clerk-note' }, '참여관: 양형기준을 벗어나면 판결서에 이유를 적어야 합니다.');
  const bar = createRangeBar('judgment-bar');
  const rangeInfo = h('div', { class: 'small', testid: 'judgment-range' });
  const addendum = h('input', { type: 'text', maxlength: String(ADDENDUM_MAX), testid: 'input-addendum', class: 'text-input', placeholder: '(선택) 양형의 이유 끝에 덧붙일 한 문장' });
  addendum.addEventListener('input', () => c.dispatch({ type: 'SET_JUDGMENT', patch: { addendum: addendum.value.trim() === '' ? '' : addendum.value } }));
  const preview = h('div', { class: 'judgment-doc', testid: 'judgment-preview' });
  const confirm = button('btn-confirm-judgment', '판결서 확정', () => c.dispatch({ type: 'CONFIRM_JUDGMENT' }), 'btn primary');
  const evidenceSec = h('div', {}, h('h3', {}, '증거의 요지'), h('p', { class: 'muted small' }, '유죄의 근거로 든 증거 카드를 끼웁니다.'), evidenceBox);
  sentencingSec.append(
    h('h3', {}, '양형의 이유'),
    h('p', { class: 'muted small' }, '양형 인자·양형 카드·형광펜 문장을 유리한 정상 또는 불리한 정상에 끼웁니다.'),
    reasonsBox,
    h('h3', {}, '권고범위 (항소심 기준)'), rangeInfo, bar.el,
  );
  const left = h('div', { class: 'col' },
    evidenceSec, sentencingSec, clerk, devSec,
    h('h3', {}, '[추가로]'), addendum,
    h('p', { class: 'muted small' }, '쓰면 권고범위 경계값의 ±20%까지 정당한 재량으로 봅니다. 문구는 선고 때 낭독되고 기록실에 남습니다.'),
  );
  el.append(h('h2', {}, '판결서'), h('div', { class: 'cols' }, left, h('div', { class: 'col' }, preview, h('div', { class: 'stage-foot' }, confirm))));

  const toggle = (key: Key, id: string) => {
    const j = c.state.judgment;
    const on = j[key].includes(id);
    const patch: Partial<GameState['judgment']> = { [key]: on ? j[key].filter((x) => x !== id) : [...j[key], id] };
    // 같은 항목을 유리·불리 양쪽에 두지 않는다.
    if (!on && key === 'favorable') patch.unfavorable = j.unfavorable.filter((x) => x !== id);
    if (!on && key === 'unfavorable') patch.favorable = j.favorable.filter((x) => x !== id);
    c.dispatch({ type: 'SET_JUDGMENT', patch });
  };
  /** 끌어다 놓기: 슬롯에 넣기만 한다(이미 있으면 그대로). 켜진 칩을 밖에 놓으면 뺀다. */
  const add = (key: Key, id: string) => { if (!c.state.judgment[key].includes(id)) toggle(key, id); };
  const dragChip = (b: HTMLElement, key: Key, id: string) =>
    dnd.source(b, id, { outside: () => { if (c.state.judgment[key].includes(id)) toggle(key, id); } });
  dnd.target(devBox, (id) => add('deviationSlots', id));
  const chip = (testid: string, label: string, on: boolean, onClick: () => void, cls = 'btn chip') => {
    const b = button(testid, label, onClick, cls);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    return b;
  };

  /** 양형의 이유 후보: 체크한 양형 인자, 보유한 양형 관련 카드, 형광펜 문장. */
  function reasonCandidates(s: GameState, sc: Scenario): { id: string; label: string; src: string }[] {
    const held = new Set(s.heldCards);
    const chosen = new Set([...s.sentencing.special, ...s.sentencing.general]);
    const factors = availableFactors(sc.sentencing.factors, held).filter((f) => chosen.has(f.id))
      .map((f) => ({ id: f.id, label: f.name, src: '양형 인자' }));
    const related = new Set([...sc.sentencing.factors, ...sc.sentencing.suspensionFactors].flatMap((f) => f.requiresAnyCard));
    const cards = sc.cards.filter((x) => held.has(x.id) && related.has(x.id)).map((x) => ({ id: x.id, label: x.title, src: '카드' }));
    const hls = s.highlights.map((x, i) => ({ id: `hl:${i}`, label: x.text, src: HL_SRC[x.docId] ?? x.docId }));
    return [...factors, ...cards, ...hls];
  }

  function evidenceDrop(el: HTMLElement): HTMLElement {
    el.dataset.testid = 'drop-evidence';
    dnd.target(el, (id) => add('evidenceSlots', id));
    return el;
  }

  function renderPreview(s: GameState, sc: Scenario) {
    const d = assembleJudgment(sc, s);
    const sec = (t: string, ...body: (Node | string)[]) => h('div', { class: 'jd-sec' }, h('div', { class: 'jd-h' }, t), ...body);
    const list = (xs: string[], empty: string) =>
      xs.length ? h('ol', {}, ...xs.map((x) => h('li', {}, x))) : h('p', { class: 'muted small' }, empty);
    const parts: HTMLElement[] = [
      h('div', { class: 'jd-title' }, '판 결'),
      sec('주 문', ...d.order.map((x) => h('p', {}, x))),
    ];
    if (d.acquittalReasons) {
      parts.push(sec('공소사실', h('p', {}, d.facts)), sec('무죄 이유', list(d.acquittalReasons, '의심 남은 칸이 없습니다.')));
      if (d.sentencingReasons.addendum) parts.push(sec('덧붙임', h('p', {}, d.sentencingReasons.addendum)));
    } else {
      parts.push(
        sec('범죄사실', h('p', {}, d.facts)),
        evidenceDrop(sec('증거의 요지', list(d.evidenceSummary, '(비어 있음)'))),
        sec('법령의 적용', h('p', {}, d.lawApplied)),
        sec('양형의 이유',
          h('div', { class: 'jd-sub' }, '유리한 정상'), list(d.sentencingReasons.favorable, '(비어 있음)'),
          h('div', { class: 'jd-sub' }, '불리한 정상'), list(d.sentencingReasons.unfavorable, '(비어 있음)'),
          ...(d.sentencingReasons.addendum ? [h('p', { class: 'jd-add' }, d.sentencingReasons.addendum)] : [])),
      );
    }
    preview.replaceChildren(...parts);
  }

  let last: GameState | null = null;
  return {
    el,
    render(s, sc) {
      if (s.phase !== 'judgment' || s === last) return;
      last = s;
      const guilty = verdictOf(s.board) === 'guilty';
      show(evidenceSec, guilty);
      show(sentencingSec, guilty);
      const j = s.judgment;

      const evCards = sc.cards.filter((x) => x.kind === 'evidence' && s.heldCards.includes(x.id));
      evidenceBox.replaceChildren(...evCards.map((x) => {
        const b = chip(`slot-evidence-${x.id}`, x.title, j.evidenceSlots.includes(x.id), () => toggle('evidenceSlots', x.id));
        dragChip(b, 'evidenceSlots', x.id);
        return b;
      }));

      reasonsBox.replaceChildren(...reasonCandidates(s, sc).map((x) => h('div', { class: 'reason-row' },
        h('span', { class: 'src small muted' }, x.src),
        h('span', { class: 'label' }, x.label),
        chip(`slot-fav-${tid(x.id)}`, '유리', j.favorable.includes(x.id), () => toggle('favorable', x.id), 'btn chip sm'),
        chip(`slot-unfav-${tid(x.id)}`, '불리', j.unfavorable.includes(x.id), () => toggle('unfavorable', x.id), 'btn chip sm'))));
      if (!reasonsBox.childElementCount) reasonsBox.append(h('p', { class: 'muted small' }, '끼울 수 있는 항목이 없습니다.'));

      // 권고범위·여유폭: [추가로]를 쓰면 여유폭이 열린다.
      const months = s.sentencing.months;
      let outside = false;
      if (guilty && months !== null) {
        // 범위 밖·여유폭·참여관 안내는 기록상 권고(항소심 기준)로 판단한다 (R11).
        const rr = recordBasis(sc, s);
        const lw = leeway(rr.range, j.addendum !== '');
        outside = months < lw.min || months > lw.max;
        rangeInfo.textContent = `기록상 권고 ${AREA_LABEL[rr.area]} ${rr.range.min}~${rr.range.max}개월 · 선고형 ${formatSentence(months)}${s.sentencing.suspended ? ' (집행유예)' : ''}${outside ? ' · 범위 밖' : ''}`;
        bar.update({
          range: rr.range, leeway: j.addendum !== '' ? lw : null, demand: sc.closing.demandMonths, months,
          scaleMax: scaleMaxOf(sc.sentencing.ranges.aggravated.max, sc.closing.demandMonths, months),
        });
      }
      const tutorial = sc.meta.tutorial;
      show(clerk, outside && tutorial);
      show(devSec, outside && !tutorial);
      if (outside && !tutorial) {
        const avail = availableFactors(sc.sentencing.factors, new Set(s.heldCards));
        devBox.replaceChildren(...avail.map((f) => {
          const b = chip(`slot-dev-${f.id}`, f.name, j.deviationSlots.includes(f.id), () => toggle('deviationSlots', f.id));
          dragChip(b, 'deviationSlots', f.id);
          return b;
        }));
      }

      if (document.activeElement !== addendum && addendum.value !== j.addendum) addendum.value = j.addendum;
      renderPreview(s, sc);
    },
  };
}
