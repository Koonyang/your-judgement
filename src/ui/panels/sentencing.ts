// 양형(설계 5.8): 왼쪽 카드 → 가운데 천칭 접시에 올린다. 천칭 기울기·계산 줄은 접시 기준(scaleView),
// 막대·권고영역 표시는 기록상 권고(R11, 항소심 기준). 형량 입력·집행유예·확정은 오른쪽.
// 입력 칸 포커스를 잃지 않도록 DOM 골격은 처음 한 번만 만들고 이후에는 내용만 갱신한다.
import type { Controller } from '../../game/controller';
import { formatSentence } from '../../engine/judgment';
import { scaleView, type ScaleView } from '../../engine/scale';
import type { Factor, Scenario } from '../../engine/scenario/schema';
import { availableFactors, leeway, validateSentence, type Area } from '../../engine/sentencing';
import type { GameState } from '../../engine/state';
import { button, h, show } from '../dom';
import { createDnd } from '../drag';
import { entryOf, panCandidates, place, remove, type PanItem, type Side } from '../pans';
import { recordBasis, sameBasis, selectedBasis, type Basis } from '../sentencingBasis';
import { createRangeBar, scaleMaxOf } from './rangebar';
import type { Panel } from './types';

export const AREA_LABEL: Record<Area, string> = { mitigated: '감경영역', basic: '기본영역', aggravated: '가중영역' };
export const SUSP_LABEL = { suspend: '집유 권고', prison: '실형 권고', discretion: '종합 판단' } as const;
const DEG_PER_TILT = 4;
const ARM = 70; // 저울대 반 길이(논리 px)

const tid = (id: string) => id.replace(/:/g, '-');
const areaText = (b: Basis) => `${AREA_LABEL[b.area]}${b.adjusted ? ' (특별조정)' : ''}`;
const names = (fs: Factor[]) => (fs.length ? fs.map((f) => `[${f.name}]`).join('') : '(없음)');

function parseMonths(v: string): number | null {
  const t = v.trim();
  return t === '' ? null : Number(t);
}

/** 접시 위 항목 = 판결서 유리/불리 칸에 들어 있는 것. */
function sideOf(sc: Scenario, s: GameState, it: PanItem): Side | null {
  const entry = entryOf(sc, it.id);
  return s.judgment.favorable.includes(entry) ? 'fav' : s.judgment.unfavorable.includes(entry) ? 'unfav' : null;
}

function calcLines(v: ScaleView): Record<'special' | 'adjust' | 'general' | 'susp', string> {
  const r = (x: { min: number; max: number }) => `${x.min}~${x.max}월`;
  const both = v.special.mitigate.length > 0 && v.special.aggravate.length > 0;
  const lean = v.general.lean < 0 ? '하한 쪽으로' : v.general.lean > 0 ? '상한 쪽으로' : '방향 없음';
  return {
    special: `① 특별인자 비교  감경 ${names(v.special.mitigate)} vs 가중 ${names(v.special.aggravate)} → ${AREA_LABEL[v.special.area]} ${r(v.special.areaRange)}`
      + (v.wobble ? ' · 행위자 인자가 우세해 종합 판단' : both ? ' · 행위인자 우선' : ''),
    adjust: v.adjust.applied
      ? `② 특별조정  같은 방향 특별인자가 2개 이상 → ${v.special.area === 'mitigated' ? '하한 1/2' : '상한 1.5배'} → ${r(v.adjust.range)}`
      : '② 특별조정  해당 없음',
    general: `③ 일반인자  감경 ${names(v.general.mitigate)} · 가중 ${names(v.general.aggravate)} → 범위 그대로, ${lean}`,
    susp: `④ 집행유예  주요 긍정 ${v.susp.majorPos} · 주요 부정 ${v.susp.majorNeg} · 일반 긍정 ${v.susp.genPos} · 일반 부정 ${v.susp.genNeg} → ${SUSP_LABEL[v.susp.rec]}`,
  };
}

export function createSentencingPanel(c: Controller): Panel {
  const el = h('section', { class: 'panel stage sentencing', testid: 'panel-sentencing' });
  const dnd = createDnd();
  let built: null | ReturnType<typeof build> = null;

  function build(sc: Scenario) {
    const S = sc.sentencing;
    const tray = h('div', { class: 'pan-tray', testid: 'pan-tray' });
    const pans = { fav: h('div', { class: 'pan fav', testid: 'pan-fav' }), unfav: h('div', { class: 'pan unfav', testid: 'pan-unfav' }) };
    const beam = h('div', { class: 'beam' });
    const scale = h('div', { class: 'scale', testid: 'scale' }, h('div', { class: 'post' }), beam,
      h('div', { class: 'pan-wrap fav' }, h('div', { class: 'pan-cap' }, '유리한 정상'), pans.fav),
      h('div', { class: 'pan-wrap unfav' }, h('div', { class: 'pan-cap' }, '불리한 정상'), pans.unfav));
    const calc = {
      special: h('div', { class: 'calc', testid: 'calc-special' }), adjust: h('div', { class: 'calc', testid: 'calc-adjust' }),
      general: h('div', { class: 'calc', testid: 'calc-general' }), susp: h('div', { class: 'calc', testid: 'calc-susp' }),
    };
    const area = h('div', { class: 'area', testid: 'sentencing-area' });
    const bar = createRangeBar('sentencing-bar');
    const susRec = h('div', { class: 'susp-rec', testid: 'susp-recommendation' });
    const selected = h('p', { class: 'muted small selected-basis', testid: 'selected-basis' });
    const months = h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', testid: 'input-months', class: 'num' });
    months.addEventListener('input', () => c.dispatch({ type: 'SET_SENTENCING', patch: { months: parseMonths(months.value) } }));
    const monthsText = h('span', { class: 'muted', testid: 'months-text' });
    const suspended = h('input', { type: 'checkbox', testid: 'chk-suspended' });
    suspended.addEventListener('change', () => c.dispatch({ type: 'SET_SENTENCING', patch: { suspended: suspended.checked } }));
    const error = h('div', { class: 'error', testid: 'sentence-error', role: 'alert' });
    const confirm = button('btn-confirm-sentencing', '양형 확정', () => c.dispatch({ type: 'CONFIRM_SENTENCING' }), 'btn primary');

    const drop = (side: Side) => (id: string) => {
      const p = place(sc, c.state, id, side);
      if (!p) {
        // 양형 인자 방향과 반대 접시: 튕겨 낸다.
        const src = tray.querySelector<HTMLElement>(`[data-testid="pan-item-${tid(id)}"]`);
        src?.classList.remove('bounce');
        void src?.offsetWidth;
        src?.classList.add('bounce');
        return;
      }
      c.dispatch({ type: 'SET_SENTENCING', patch: p.sentencing });
      c.dispatch({ type: 'SET_JUDGMENT', patch: p.judgment });
    };
    dnd.target(pans.fav, drop('fav'));
    dnd.target(pans.unfav, drop('unfav'));

    el.append(
      h('h2', {}, '양형'),
      h('p', { class: 'guideline' }, h('span', { class: 'muted small' }, '양형기준 유형 '), h('span', { testid: 'guideline-name' }, S.guidelineName),
        h('span', { class: 'muted small' }, ` · 법정형 상한 ${formatSentence(S.statutoryMaxMonths)}`)),
      h('div', { class: 'sent-grid' },
        h('div', { class: 'col' }, h('h3', {}, '기록의 카드'),
          h('p', { class: 'muted small' }, '끌어다 접시에 올리거나, 눌러 고른 뒤 접시를 누릅니다. 접시에서 끌어내면 내려갑니다.'), tray),
        h('div', { class: 'col' }, scale,
          h('div', { class: 'calc-lines' }, calc.special, calc.adjust, calc.general, calc.susp),
          h('h3', {}, '기록상 권고 (항소심 기준)'), area, bar.el,
          h('div', { class: 'susp-line' }, h('span', {}, '집행유예: '), susRec), selected),
        h('div', { class: 'col' }, h('h3', {}, '선고형'),
          h('div', { class: 'sentence-input' }, h('span', {}, '징역'), months, h('span', {}, '개월')), monthsText,
          h('label', { class: 'check' }, suspended, h('span', {}, '집행유예')), error,
          h('div', { class: 'stage-foot' }, confirm))),
    );
    return { tray, pans, beam, scale, calc, area, bar, susRec, selected, months, monthsText, suspended, error, confirm };
  }

  let lastKey = '';
  return {
    el,
    render(s, sc) {
      if (s.phase !== 'sentencing' && built) return;
      const b = (built ??= build(sc));
      const S = sc.sentencing;
      const held = new Set(s.heldCards);

      // 카드·접시: 상태가 바뀐 때만 다시 그린다(드래그 중인 원소를 지우지 않게).
      const key = JSON.stringify([s.heldCards, s.highlights.length, s.judgment.favorable, s.judgment.unfavorable]);
      if (key !== lastKey) {
        lastKey = key;
        const items = panCandidates(sc, s);
        const chip = (it: PanItem, testid: string) => {
          const x = h('span', { class: `btn chip pan-chip ${it.src === '형광펜' ? 'hl' : ''}`, testid, title: it.label },
            h('span', { class: 'src' }, it.src), ` ${it.label}`);
          return x;
        };
        const on = { fav: [] as HTMLElement[], unfav: [] as HTMLElement[] };
        const off: HTMLElement[] = [];
        for (const it of items) {
          const side = sideOf(sc, s, it);
          if (side) {
            const x = chip(it, `pan-on-${tid(it.id)}`);
            dnd.source(x, it.id, {
              outside: () => {
                const p = remove(sc, c.state, it.id);
                c.dispatch({ type: 'SET_SENTENCING', patch: p.sentencing });
                c.dispatch({ type: 'SET_JUDGMENT', patch: p.judgment });
              },
            });
            on[side].push(x);
          } else {
            const x = chip(it, `pan-item-${tid(it.id)}`);
            dnd.source(x, it.id, { select: true });
            off.push(x);
          }
        }
        b.tray.replaceChildren(...(off.length ? off : [h('span', { class: 'muted small' }, '올릴 카드가 없습니다.')]));
        b.pans.fav.replaceChildren(...on.fav);
        b.pans.unfav.replaceChildren(...on.unfav);
      }

      // 천칭·계산 줄: 접시 기준
      const factors = availableFactors(S.factors, held).filter((f) => [...s.sentencing.special, ...s.sentencing.general].includes(f.id));
      const susp = availableFactors(S.suspensionFactors, held).filter((f) => s.sentencing.susp.includes(f.id));
      const v = scaleView(S, factors, susp);
      const deg = v.tilt * DEG_PER_TILT;
      b.scale.dataset.tilt = String(v.tilt);
      b.scale.classList.toggle('wobble', v.wobble);
      b.beam.style.transform = `rotate(${deg}deg)`;
      const dy = ARM * Math.sin((deg * Math.PI) / 180);
      (b.pans.fav.parentElement as HTMLElement).style.transform = `translateY(${-dy}px)`;
      (b.pans.unfav.parentElement as HTMLElement).style.transform = `translateY(${dy}px)`;
      const lines = calcLines(v);
      for (const k of ['special', 'adjust', 'general', 'susp'] as const) b.calc[k].textContent = lines[k];
      b.calc.adjust.classList.toggle('off', !v.adjust.applied);

      // 막대: 기록상 권고(R11)
      const rr = recordBasis(sc, s);
      b.area.textContent = `${areaText(rr)} ${rr.range.min}~${rr.range.max}개월${rr.judgmentCall ? ' · 행위자 인자가 우세해 종합 판단 필요' : ''}`;
      const months = s.sentencing.months;
      const hasAddendum = s.judgment.addendum !== '';
      b.bar.update({
        range: rr.range, leeway: hasAddendum ? leeway(rr.range, true) : null, demand: sc.closing.demandMonths,
        months: months !== null && Number.isFinite(months) ? months : null,
        scaleMax: scaleMaxOf(S.ranges.aggravated.max, sc.closing.demandMonths, months), lean: v.general.lean,
      });
      b.susRec.textContent = SUSP_LABEL[rr.susp];
      b.susRec.dataset.rec = rr.susp;
      const sel = selectedBasis(sc, s);
      const differs = !sameBasis(sel, rr);
      show(b.selected, differs);
      b.selected.textContent = differs ? `접시 기준은 ${areaText(sel)} ${sel.range.min}~${sel.range.max}개월 · ${SUSP_LABEL[sel.susp]}. 기록에 근거가 있는 카드는 항소심이 모두 봅니다.` : '';

      if (parseMonths(b.months.value) !== months && !(months !== null && Number.isNaN(months))) b.months.value = months === null ? '' : String(months);
      b.suspended.checked = s.sentencing.suspended;
      const err = months === null ? null : validateSentence({ months, suspended: s.sentencing.suspended }, S.statutoryMaxMonths);
      b.error.textContent = err ?? '';
      b.monthsText.textContent = months !== null && err === null ? `= ${formatSentence(months)}` : '';
      b.confirm.disabled = months === null || err !== null;
    },
  };
}
