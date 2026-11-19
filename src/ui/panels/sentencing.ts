// 양형: 유형명, 특별·일반인자 체크(근거 카드가 없는 인자는 비활성), 권고영역·범위 막대 + 구형 선,
// 집행유예 참작사유와 권고, 형량 입력(validateSentence 오류 문구), 집행유예 체크.
// 입력 칸 포커스를 잃지 않도록 DOM은 처음 한 번만 만들고 이후에는 속성만 갱신한다.
import type { Controller } from '../../game/controller';
import { formatSentence } from '../../engine/judgment';
import type { Factor, Scenario, SuspFactor } from '../../engine/scenario/schema';
import { leeway, validateSentence, type Area } from '../../engine/sentencing';
import { button, h, show } from '../dom';
import { recordBasis, sameBasis, selectedBasis, type Basis } from '../sentencingBasis';
import { createRangeBar, scaleMaxOf } from './rangebar';
import type { Panel } from './types';

export const AREA_LABEL: Record<Area, string> = { mitigated: '감경영역', basic: '기본영역', aggravated: '가중영역' };
export const SUSP_LABEL = { suspend: '집유 권고', prison: '실형 권고', discretion: '종합 판단' } as const;

function areaText(b: Basis): string {
  return `${AREA_LABEL[b.area]}${b.adjusted ? ' (특별조정)' : ''}`;
}

/** 숫자 입력값 → months. 빈 칸이면 null, 숫자가 아니면 NaN(오류 문구로 이어짐). */
function parseMonths(v: string): number | null {
  const t = v.trim();
  return t === '' ? null : Number(t);
}

type Row = { input: HTMLInputElement; row: HTMLElement; req: string[] };

export function createSentencingPanel(c: Controller): Panel {
  const el = h('section', { class: 'panel stage sentencing', testid: 'panel-sentencing' });
  let built: null | {
    factorRows: Map<string, Row>; suspRows: Map<string, Row>;
    area: HTMLElement; bar: ReturnType<typeof createRangeBar>; susRec: HTMLElement; selected: HTMLElement;
    months: HTMLInputElement; monthsText: HTMLElement; suspended: HTMLInputElement; error: HTMLElement; confirm: HTMLButtonElement;
  } = null;

  function checkRow(testid: string, label: string, tag: string, onChange: (on: boolean) => void): Row & { input: HTMLInputElement } {
    const input = h('input', { type: 'checkbox', testid });
    input.addEventListener('change', () => onChange(input.checked));
    const row = h('label', { class: 'check' }, input, h('span', {}, label), h('span', { class: 'tag' }, tag), h('span', { class: 'why muted small' }, ''));
    return { input, row, req: [] };
  }

  function build(sc: Scenario) {
    const S = sc.sentencing;
    const toggle = (key: 'special' | 'general' | 'susp', id: string, on: boolean) => {
      const cur = c.state.sentencing[key];
      const next = on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id);
      c.dispatch({ type: 'SET_SENTENCING', patch: { [key]: next } });
    };
    const factorRows = new Map<string, Row>();
    const factorRow = (f: Factor) => {
      const tag = `${f.direction === 'mitigate' ? '감경' : '가중'} · ${f.nature === 'act' || f.actEquivalent ? '행위' : '행위자'}`;
      const r = checkRow(`factor-${f.id}`, f.name, tag, (on) => toggle(f.tier, f.id, on));
      r.req = f.requiresAnyCard;
      factorRows.set(f.id, r);
      return r.row;
    };
    const suspRows = new Map<string, Row>();
    const suspRow = (f: SuspFactor) => {
      const tag = `${f.tier === 'major' ? '주요' : '일반'} · ${f.direction === 'positive' ? '긍정' : '부정'}`;
      const r = checkRow(`susp-${f.id}`, f.name, tag, (on) => toggle('susp', f.id, on));
      r.req = f.requiresAnyCard;
      suspRows.set(f.id, r);
      return r.row;
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

    const left = h('div', { class: 'col' },
      h('h3', {}, '특별양형인자'), ...S.factors.filter((f) => f.tier === 'special').map(factorRow),
      h('h3', {}, '일반양형인자'), ...S.factors.filter((f) => f.tier === 'general').map(factorRow),
      h('h3', {}, '집행유예 참작사유'), ...S.suspensionFactors.map(suspRow),
    );
    const right = h('div', { class: 'col' },
      h('h3', {}, '기록상 권고 (항소심 기준)'), area, bar.el,
      h('div', { class: 'susp-line' }, h('span', {}, '집행유예: '), susRec),
      selected,
      h('h3', {}, '선고형'),
      h('div', { class: 'sentence-input' }, h('span', {}, '징역'), months, h('span', {}, '개월'), monthsText),
      h('label', { class: 'check' }, suspended, h('span', {}, '집행유예')),
      error,
      h('div', { class: 'stage-foot' }, confirm),
    );
    el.append(
      h('h2', {}, '양형'),
      h('p', { class: 'guideline' }, h('span', { class: 'muted small' }, '양형기준 유형 '), h('span', { testid: 'guideline-name' }, S.guidelineName),
        h('span', { class: 'muted small' }, ` · 법정형 상한 ${formatSentence(S.statutoryMaxMonths)}`)),
      h('p', { class: 'muted small' }, '기록에 근거가 있는 인자는 모두 권고 계산에 반영됩니다. 체크한 인자는 판결서의 양형 이유에 쓸 수 있습니다. 근거 카드가 없는 인자는 고를 수 없습니다.'),
      h('div', { class: 'cols' }, left, right),
    );
    return { factorRows, suspRows, area, bar, susRec, selected, months, monthsText, suspended, error, confirm };
  }

  return {
    el,
    render(s, sc) {
      if (s.phase !== 'sentencing' && built) return;
      const b = (built ??= build(sc));
      const held = new Set(s.heldCards);
      const sync = (rows: Map<string, Row>, chosen: string[]) => {
        for (const [id, r] of rows) {
          const ok = r.req.some((x) => held.has(x));
          r.input.disabled = !ok;
          r.input.checked = ok && chosen.includes(id);
          r.row.classList.toggle('disabled', !ok);
          r.row.querySelector('.why')!.textContent = ok ? '' : '근거 카드 없음';
        }
      };
      sync(b.factorRows, [...s.sentencing.special, ...s.sentencing.general]);
      sync(b.suspRows, s.sentencing.susp);

      const rr = recordBasis(sc, s);
      b.area.textContent = `${areaText(rr)}${rr.judgmentCall ? ' · 행위자 인자가 우세해 종합 판단 필요' : ''}`;
      const months = s.sentencing.months;
      const hasAddendum = s.judgment.addendum !== '';
      b.bar.update({
        range: rr.range, leeway: hasAddendum ? leeway(rr.range, true) : null, demand: sc.closing.demandMonths,
        months: months !== null && Number.isFinite(months) ? months : null,
        scaleMax: scaleMaxOf(sc.sentencing.ranges.aggravated.max, sc.closing.demandMonths, months),
      });
      b.susRec.textContent = SUSP_LABEL[rr.susp];
      b.susRec.dataset.rec = rr.susp;
      // 체크한 인자만으로 본 결과는 기록상 권고와 다를 때만 보조로 보인다.
      const sel = selectedBasis(sc, s);
      const differs = !sameBasis(sel, rr);
      show(b.selected, differs);
      b.selected.textContent = differs
        ? `선택한 인자 기준: ${areaText(sel)} ${sel.range.min}~${sel.range.max}개월 · ${SUSP_LABEL[sel.susp]}`
        : '';

      // 사용자가 입력 중인 값(예: "6.")을 덮어쓰지 않도록, 값이 다를 때만 반영.
      if (parseMonths(b.months.value) !== months && !(months !== null && Number.isNaN(months))) b.months.value = months === null ? '' : String(months);
      b.suspended.checked = s.sentencing.suspended;
      const err = months === null ? null : validateSentence({ months, suspended: s.sentencing.suspended }, sc.sentencing.statutoryMaxMonths);
      b.error.textContent = err ?? '';
      b.monthsText.textContent = months !== null && err === null ? `= ${formatSentence(months)}` : '';
      b.confirm.disabled = months === null || err !== null;
    },
  };
}
