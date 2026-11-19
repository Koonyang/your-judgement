// 권고범위 막대: 권고범위, (부기 시) 여유폭, 검사 구형 선, 선고 형량 표시.
import type { Range } from '../../engine/scenario/schema';
import { formatSentence } from '../../engine/judgment';
import { h } from '../dom';

export type RangeBarData = { range: Range; leeway: Range | null; demand: number; months: number | null; scaleMax: number };

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const fmt = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

export function createRangeBar(testid: string): { el: HTMLElement; update(d: RangeBarData): void } {
  const track = h('div', { class: 'rb-track' });
  const leewayEl = h('div', { class: 'rb-leeway', testid: `${testid}-leeway` });
  const rangeEl = h('div', { class: 'rb-range', testid: `${testid}-range` });
  const demandEl = h('div', { class: 'rb-demand', testid: `${testid}-demand` }, h('span', {}, ''));
  const monthsEl = h('div', { class: 'rb-months', testid: `${testid}-months` }, h('span', {}, ''));
  const ticks = h('div', { class: 'rb-ticks' });
  const legend = h('div', { class: 'rb-legend small' });
  track.append(leewayEl, rangeEl, demandEl, monthsEl);
  const el = h('div', { class: 'rangebar', testid }, track, ticks, legend);
  return {
    el,
    update({ range, leeway, demand, months, scaleMax }) {
      const place = (x: HTMLElement, r: Range) => {
        x.style.left = pct(r.min, scaleMax);
        x.style.width = `calc(${pct(r.max, scaleMax)} - ${pct(r.min, scaleMax)})`;
      };
      place(rangeEl, range);
      leewayEl.hidden = leeway === null;
      if (leeway) place(leewayEl, leeway);
      demandEl.style.left = pct(demand, scaleMax);
      demandEl.firstElementChild!.textContent = `구형 ${formatSentence(demand).replace('징역 ', '')}`;
      monthsEl.hidden = months === null;
      if (months !== null) {
        monthsEl.style.left = pct(months, scaleMax);
        monthsEl.firstElementChild!.textContent = `선고 ${fmt(months)}개월`;
      }
      const tickEls: HTMLElement[] = [];
      for (let m = 0; m <= scaleMax; m += 6) {
        const t = h('span', { class: 'rb-tick' }, `${m}`);
        t.style.left = pct(m, scaleMax);
        tickEls.push(t);
      }
      ticks.replaceChildren(...tickEls);
      legend.replaceChildren(
        h('span', { class: 'lg range' }, `권고범위 ${fmt(range.min)}~${fmt(range.max)}개월`),
        ...(leeway ? [h('span', { class: 'lg leeway' }, `여유폭 ${fmt(leeway.min)}~${fmt(leeway.max)}개월`)] : []),
        h('span', { class: 'lg demand' }, `검사 구형 ${demand}개월`),
      );
    },
  };
}

/** 막대 눈금 상한: 가중 특별조정 상한·구형·입력 형량 중 큰 값을 6개월 단위로 올림. */
export function scaleMaxOf(aggravatedMax: number, demand: number, months: number | null): number {
  const m = Math.max(aggravatedMax * 1.5, demand * 1.25, months !== null && Number.isFinite(months) ? months : 0);
  return Math.ceil(m / 6) * 6;
}
