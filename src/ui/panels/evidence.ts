// 증거목록: 전산양식 B1280(증거서류 등) 칸 배치를 따른다(고증 노트 2-1). 신청인별로 표를 나눈다.
// 의견 ○/× = 동의(피의자신문조서는 인정) 여부, 결정 ○ = 채택(열람 가능). 부동의로 잠긴 증거는 결정란을 비우고 내용을 숨긴다.
import type { Evidence, Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';
import { h } from '../dom';
import type { Panel } from './types';

/** "진술조서(노은숙)" → ["진술조서", "노은숙"] */
function splitLabel(label: string): [string, string] {
  const m = /^(.*)\((.*)\)$/.exec(label);
  return m ? [m[1], m[2]] : [label, ''];
}

function table(sc: Scenario, s: GameState, list: Evidence[], applicant: string): HTMLElement {
  const th = (t: string, attrs: Record<string, string> = {}) => h('th', attrs, t);
  const rows = list.flatMap((e, i) => {
    const open = s.unlockedEvidence.includes(e.id);
    const [name, person] = splitLabel(e.label);
    // 부동의 진술조서의 원진술자가 증인으로 나오면 비고에 적는다.
    const witness = !e.consent && person !== '' && sc.exams.some((x) => x.kind === 'witness' && x.name.includes(person));
    const row = h('tr', { class: `ev ${open ? 'open' : 'locked'}`, testid: `evidence-${e.id}` },
      h('td', {}, String(i + 1)), h('td', { class: 'ev-label' }, ...(open ? [] : [h('span', { class: 'lock', role: 'img', 'aria-label': '열람 불가' })]), name), h('td', {}, person), h('td', {}, ''),
      h('td', { class: 'mark' }, e.consent ? '○' : '×'), h('td', { class: 'mark seal' }, open ? '○' : ''),
      h('td', { class: 'small' }, witness && !open ? '원진술자 증인 신청' : ''));
    const body = h('tr', { class: 'ev-body-row' }, h('td', {}, ''),
      h('td', { colspan: '6', class: `ev-body${open ? '' : ' muted'}` }, open ? e.body : '열람할 수 없습니다.'));
    return [row, body];
  });
  return h('div', { class: 'b1280' },
    h('div', { class: 'b1280-head' }, h('span', {}, `신청인 : ${applicant}`)),
    h('table', {},
      h('thead', {},
        h('tr', {}, th('순번', { rowspan: '2' }), th('증거방법', { colspan: '2' }), th('참조사항 등', { rowspan: '2' }),
          th('증거의견'), th('증거결정'), th('비고', { rowspan: '2' })),
        h('tr', {}, th('증거명칭'), th('성명'), th('내용'), th('내용'))),
      h('tbody', {}, ...rows)));
}

export function createEvidencePanel(): Panel {
  const list = h('div', { class: 'evidence-list' });
  const el = h('section', { class: 'panel evidence', testid: 'panel-evidence' },
    h('h2', { class: 'b1280-title' }, '증 거 목 록 (증거서류 등)'), list,
    h('p', { class: 'muted small' }, '※ 증거의견 표시 - 피의자신문조서 : 인정 ○, 부인 × / 기타 증거서류 : 동의 ○, 부동의 ×  ※ 증거결정 표시 : 채 ○, 부 ×'));
  let lastFiled: GameState['filedEvidence'] | null = null;
  let lastUnlocked: GameState['unlockedEvidence'] | null = null;
  return {
    el,
    render(s: GameState, sc: Scenario) {
      if (s.filedEvidence === lastFiled && s.unlockedEvidence === lastUnlocked) return;
      lastFiled = s.filedEvidence;
      lastUnlocked = s.unlockedEvidence;
      const filed = sc.evidence.filter((e) => s.filedEvidence.includes(e.id));
      const groups = [['prosecutor', '검사'], ['defense', '피고인(변호인)']] as const;
      list.replaceChildren(...groups
        .map(([by, name]) => [filed.filter((e) => e.submittedBy === by), name] as const)
        .filter(([xs]) => xs.length > 0)
        .map(([xs, name]) => table(sc, s, xs, name)));
      if (!list.childElementCount) list.append(h('p', { class: 'muted' }, '아직 제출된 증거가 없습니다.'));
    },
  };
}
