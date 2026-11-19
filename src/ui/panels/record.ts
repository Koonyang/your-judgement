// 판결 기록실: 이번 사건 항목 + 이전에 저장된 항목. 저장은 오버레이가 record 단계 진입 때 한다.
import type { RecordEntry } from '../../engine/record';
import { h } from '../dom';
import { RESULT_LABEL } from './result';
import type { Panel } from './types';

function entryView(e: RecordEntry, current: boolean): HTMLElement {
  return h('li', { class: `record-entry${current ? ' current' : ''}`, testid: 'record-entry' },
    h('div', { class: 'rec-head' },
      h('span', { class: 'rec-title' }, `${e.title}`),
      h('span', { class: 'rec-result' }, RESULT_LABEL[e.result])),
    h('div', { class: 'rec-line' }, `${e.verdict}${e.sentence ? ` · ${e.sentence}` : ''}`),
    ...(e.remarks.length ? [h('ul', { class: 'rec-remarks small' }, ...e.remarks.map((r) => h('li', {}, r)))] : []));
}

export function createRecordPanel(): Panel & { setEntries(current: RecordEntry, previous: RecordEntry[], saved: boolean): void } {
  const cur = h('ol', { class: 'record-list' });
  const prev = h('ol', { class: 'record-list' });
  const note = h('p', { class: 'muted small', testid: 'record-note' });
  const el = h('section', { class: 'panel main wide record', testid: 'panel-record' },
    h('h2', {}, '판결 기록실'), h('h3', {}, '이번 사건'), cur, h('h3', {}, '지난 기록'), prev, note);
  return {
    el,
    render() {},
    setEntries(current, previous, saved) {
      cur.replaceChildren(entryView(current, true));
      prev.replaceChildren(...(previous.length
        ? [...previous].reverse().map((e) => entryView(e, false))
        : [h('li', { class: 'muted' }, '지난 기록이 없습니다.')]));
      note.textContent = saved ? '' : '이 브라우저에 기록을 저장하지 못했습니다. 게임 진행에는 영향이 없습니다.';
    },
  };
}
