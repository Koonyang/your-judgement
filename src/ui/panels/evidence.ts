// 증거목록: 표목·제출자·동의 여부. 채택(열람 가능) 전에는 자물쇠와 함께 내용을 숨긴다.
import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { h } from '../dom';
import type { Panel } from './types';

export function createEvidencePanel(): Panel {
  const list = h('ol', { class: 'evidence-list' });
  const el = h('section', { class: 'panel evidence', testid: 'panel-evidence' }, h('h2', {}, '증거목록'), list);
  let lastFiled: GameState['filedEvidence'] | null = null;
  let lastUnlocked: GameState['unlockedEvidence'] | null = null;
  return {
    el,
    render(s: GameState, sc: Scenario) {
      if (s.filedEvidence === lastFiled && s.unlockedEvidence === lastUnlocked) return;
      lastFiled = s.filedEvidence;
      lastUnlocked = s.unlockedEvidence;
      list.replaceChildren(
        ...sc.evidence
          .filter((e) => s.filedEvidence.includes(e.id))
          .map((e) => {
            const open = s.unlockedEvidence.includes(e.id);
            return h(
              'li',
              { class: `ev ${open ? 'open' : 'locked'}`, testid: `evidence-${e.id}` },
              h(
                'div',
                { class: 'ev-head' },
                h('span', { class: 'ev-label' }, `${open ? '' : '🔒 '}${e.label}`),
                h('span', { class: 'ev-meta' }, `${e.submittedBy === 'prosecutor' ? '검사' : '변호인'} 제출 · ${e.consent ? '동의' : '부동의'}`),
              ),
              open ? h('p', { class: 'ev-body' }, e.body) : h('p', { class: 'ev-body muted' }, '열람할 수 없습니다.'),
            );
          }),
      );
      if (!list.childElementCount) list.append(h('li', { class: 'muted' }, '아직 제출된 증거가 없습니다.'));
    },
  };
}
