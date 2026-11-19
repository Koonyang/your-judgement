// 판결 단계(verdict~record) 자리. Task 10에서 교체.
import { h } from '../dom';
import type { Panel } from './types';

export function createPlaceholderPanel(): Panel {
  const el = h('section', { class: 'panel placeholder', testid: 'panel-placeholder' }, h('h2', {}, '판결 단계 (다음 작업)'));
  return { el, render() {} };
}
