// 양형 저울질(설계 5.8): 책상 위 카드를 허공의 천칭 접시에 올린다. 천칭 기울기·수치 없는 막대는 접시 기준(scaleView).
// [저울질을 마친다] 뒤의 판결(주문·증거의 요지·양형의 이유)은 판결서 작성 패널(judgment.ts)이 맡는다.
import type { Controller } from '../../game/controller';
import { scaleView, type ScaleView } from '../../engine/scale';
import type { Factor, Scenario } from '../../engine/scenario/schema';
import { availableFactors, type Area } from '../../engine/sentencing';
import type { GameState } from '../../engine/state';
import { button, h } from '../dom';
import { createDnd } from '../drag';
import { entryOf, panCandidates, place, remove, type PanItem, type Side } from '../pans';
import type { Basis } from '../sentencingBasis';
import { createRangeBar, scaleMaxOf } from './rangebar';
import type { Panel } from './types';

export const AREA_LABEL: Record<Area, string> = { mitigated: '감경영역', basic: '기본영역', aggravated: '가중영역' };
export const SUSP_LABEL = { suspend: '집유 권고', prison: '실형 권고', discretion: '종합 판단' } as const;
const DEG_PER_TILT = 4;
const ARM = 70; // 저울대 반 길이(논리 px)

const tid = (id: string) => id.replace(/:/g, '-');
export const areaText = (b: Basis) => `${AREA_LABEL[b.area]}${b.adjusted ? ' (특별조정)' : ''}`;
const names = (fs: Factor[]) => (fs.length ? fs.map((f) => `[${f.name}]`).join('') : '(없음)');

/** 접시 위 항목 = 판결서 유리/불리 칸에 들어 있는 것. */
function sideOf(sc: Scenario, s: GameState, it: PanItem): Side | null {
  const entry = entryOf(sc, it.id);
  return s.judgment.favorable.includes(entry) ? 'fav' : s.judgment.unfavorable.includes(entry) ? 'unfav' : null;
}

export function calcLines(v: ScaleView): Record<'special' | 'adjust' | 'general' | 'susp', string> {
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

export type SentencingPanel = Panel & { weighing(): boolean; setWeighing(on: boolean): void };

/** onChange: 저울질 ↔ 판결서 작성 전환 때 오버레이를 다시 그리게 한다. */
export function createSentencingPanel(c: Controller, onChange: () => void): SentencingPanel {
  const el = h('section', { class: 'panel stage sentencing weigh', testid: 'panel-sentencing' });
  const dnd = createDnd();
  let built: null | ReturnType<typeof build> = null;
  let weighing = true;
  let wasHere = false;

  function build(sc: Scenario) {
    const tray = h('div', { class: 'pan-tray', testid: 'pan-tray' });
    const pans = { fav: h('div', { class: 'pan fav', testid: 'pan-fav' }), unfav: h('div', { class: 'pan unfav', testid: 'pan-unfav' }) };
    const beam = h('div', { class: 'beam' });
    const scale = h('div', { class: 'scale', testid: 'scale' }, h('div', { class: 'post' }), beam,
      h('div', { class: 'pan-wrap fav' }, h('div', { class: 'pan-cap' }, '유리한 정상'), pans.fav),
      h('div', { class: 'pan-wrap unfav' }, h('div', { class: 'pan-cap' }, '불리한 정상'), pans.unfav));
    const bar = createRangeBar('sentencing-bar');
    bar.el.classList.add('bare');

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

    const done = button('btn-scale-done', '저울질을 마친다', () => api.setWeighing(false), 'btn primary');
    el.append(
      h('div', { class: 'sent-grid' }, h('div', { class: 'col' }, tray), h('div', { class: 'col scale-col' }, scale, bar.el)),
      h('div', { class: 'weigh-foot' }, done),
    );
    return { tray, pans, beam, scale, bar };
  }

  let lastKey = '';
  const api: SentencingPanel = {
    el,
    weighing: () => weighing,
    setWeighing(on) {
      weighing = on;
      onChange();
    },
    render(s, sc) {
      // 양형 단계에 새로 들어오면 늘 저울질부터.
      if (s.phase === 'sentencing' && !wasHere) weighing = true;
      wasHere = s.phase === 'sentencing';
      if (s.phase !== 'sentencing' && built) return;
      const b = (built ??= build(sc));
      const S = sc.sentencing;
      const held = new Set(s.heldCards);

      // 카드·접시: 상태가 바뀐 때만 다시 그린다(드래그 중인 원소를 지우지 않게).
      const key = JSON.stringify([s.heldCards, s.highlights.length, s.judgment.favorable, s.judgment.unfavorable]);
      if (key !== lastKey) {
        lastKey = key;
        const items = panCandidates(sc, s);
        const chip = (it: PanItem, testid: string) =>
          h('button', { type: 'button', class: `btn chip pan-chip ${it.src === '형광펜' ? 'hl' : ''}`, testid, title: it.label },
            h('span', { class: 'src' }, it.src), ` ${it.label}`);
        const on = { fav: [] as HTMLElement[], unfav: [] as HTMLElement[] };
        const off: HTMLElement[] = [];
        for (const it of items) {
          const side = sideOf(sc, s, it);
          if (side) {
            const x = chip(it, `pan-on-${tid(it.id)}`);
            const takeOff = () => {
              const p = remove(sc, c.state, it.id);
              c.dispatch({ type: 'SET_SENTENCING', patch: p.sentencing });
              c.dispatch({ type: 'SET_JUDGMENT', patch: p.judgment });
            };
            // 접시의 카드: 누르면(또는 밖으로 끌면) 내린다. 접시 클릭으로 번지지 않게 막는다.
            x.addEventListener('click', (e) => {
              if (dnd.hasSelection()) return; // 고른 카드를 이 접시에 놓는 클릭
              e.stopPropagation();
              takeOff();
            });
            dnd.source(x, it.id, { outside: takeOff });
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

      // 천칭·막대: 접시 기준(수치는 숨김)
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
      b.bar.update({
        range: v.adjust.range, leeway: null, demand: sc.closing.demandMonths, months: null,
        scaleMax: scaleMaxOf(S.ranges.aggravated.max, sc.closing.demandMonths, null), lean: v.general.lean,
      });
    },
  };
  return api;
}
