// 대사 줄(y150–200): 초상 + 화자·대사, [다음]·[제지]·이의 결정·보충신문 질문(줄 위로 펼침).
// 설계 규칙: 어떤 라인이 제지 가능한지 표시하지 않는다. 제지가 무시돼도 반응하지 않는다.
import type { Controller } from '../../game/controller';
import { suppFlag } from '../../engine/reducer';
import type { GameState } from '../../engine/state';
import { button, h, show } from '../dom';
import { SEATS } from '../../scenes/seats';
import type { Panel } from './types';

/** 라인이 없는 단계의 안내문과 [다음] 버튼 문구. */
const NARRATION: Partial<Record<GameState['phase'], { text: string; next: string }>> = {
  pretrial: { text: '공판 전에는 공소장과 피고인 의견서만 볼 수 있습니다. 준비가 되면 공판을 엽니다.', next: '공판 개정' },
  evidence: {
    text: '증거조사. 피고인이 동의한 증거는 채택되어 열람할 수 있습니다. 부동의한 증거는 표목만 남습니다.',
    next: '증인신문으로',
  },
  review: { text: '선고기일 전 재검토. 위의 탭에서 기록을 자유롭게 열람할 수 있습니다.', next: '선고기일로' },
};
const BLOCK_END: Partial<Record<GameState['phase'], string>> = {
  opening: '모두절차를 마칩니다.',
  closing: '변론을 종결합니다.',
};

export function createDialoguePanel(c: Controller): Panel {
  const speaker = h('div', { class: 'speaker', testid: 'dialogue-speaker' });
  const text = h('div', { class: 'text', testid: 'dialogue-text' });
  const note = h('div', { class: 'note', testid: 'dialogue-note' });
  const supp = h('div', { class: 'supp', testid: 'supp-list' });
  const next = button('btn-next', '다음', () => (c.replaying ? c.ack() : c.dispatch({ type: 'ADVANCE' })), 'btn primary');
  const interrupt = button('btn-interrupt', '제지', () => c.dispatch({ type: 'INTERRUPT' }), 'btn warn');
  const sustain = button('btn-sustain', '인용', () => c.dispatch({ type: 'RULE_OBJECTION', ruling: 'sustain' }));
  const overrule = button('btn-overrule', '기각', () => c.dispatch({ type: 'RULE_OBJECTION', ruling: 'overrule' }));
  // 결심의 최후진술은 형광펜으로 표시할 수 있다(문장 일부를 드래그하거나, 선택이 없으면 대사 전체).
  const hlClosing = button('btn-highlight-closing', '형광펜', () => {
    const line = c.shownLine();
    if (!line) return;
    const sel = window.getSelection();
    const picked = sel && text.contains(sel.anchorNode) && text.contains(sel.focusNode) ? sel.toString().trim() : '';
    const t = picked || line.text;
    sel?.removeAllRanges();
    // 이미 같은 문장을 표시했으면 무시(리듀서도 중복을 거르지만 의도를 분명히 한다).
    if (c.state.highlights.some((x) => x.docId === 'closing' && x.text === t)) return;
    c.dispatch({ type: 'HIGHLIGHT', docId: 'closing', text: t });
  });
  hlClosing.addEventListener('mousedown', (e) => e.preventDefault());
  const suppEnd = button('btn-supp-end', '묻지 않음', () => c.dispatch({ type: 'END_SUPP' }));
  const actions = h('div', { class: 'actions' }, hlClosing, interrupt, sustain, overrule, suppEnd, next);
  const portrait = h('div', { class: 'portrait', testid: 'dialogue-portrait' });
  const body = h('div', { class: 'dl-body' }, h('div', {}, speaker, text), note);
  const el = h('section', { class: 'dialogue', testid: 'panel-dialogue' }, portrait, body, actions, supp);

  return {
    el,
    render(s, sc) {
      const line = c.shownLine();
      const examSupp = s.phase === 'exam' && s.cursor.inSupp && !c.replaying;
      const objection = !c.replaying && line?.objection ? line.objection : null;

      speaker.textContent = line ? c.speakerName(line.speaker) : '';
      show(speaker, !!line);
      // 초상 플레이스홀더: 좌석 색 + 이름 첫 글자. 나중에 같은 화자 키로 그림 교체.
      show(portrait, !!line);
      if (line) {
        portrait.dataset.speaker = line.speaker;
        portrait.style.background = `#${SEATS[line.speaker].color.toString(16).padStart(6, '0')}`;
        portrait.textContent = speaker.textContent.slice(0, 1);
      }
      if (line) text.textContent = line.text;
      else if (examSupp) text.textContent = '보충신문. 재판장이 직접 물어볼 것이 있으면 고르십시오.';
      else text.textContent = NARRATION[s.phase]?.text ?? BLOCK_END[s.phase] ?? '';
      text.classList.toggle('narration', !line);

      note.textContent = objection ? `${objection.by === 'defense' ? '변호인이' : '검사가'} 이의를 제기했습니다.` : '';
      show(note, !!objection);

      show(supp, examSupp);
      if (examSupp) {
        const exam = sc.exams[s.cursor.examIndex];
        supp.replaceChildren(
          ...exam.supplementary.map((q) => {
            const b = button(`btn-supp-${q.id}`, q.text, () => c.dispatch({ type: 'ASK_SUPP', questionId: q.id }), 'btn q');
            b.disabled = s.flags.includes(suppFlag(q.id));
            return b;
          }),
        );
        suppEnd.textContent = exam.supplementary.some((q) => s.flags.includes(suppFlag(q.id))) ? '신문 종료' : '묻지 않음';
      }

      show(interrupt, s.phase === 'exam' && !c.replaying && !s.cursor.inSupp && !!line);
      show(sustain, !!objection);
      show(overrule, !!objection);
      show(suppEnd, examSupp);
      const closingStmt = s.phase === 'closing' && line?.speaker === 'defendant';
      show(hlClosing, closingStmt);
      show(next, !objection && !examSupp);
      next.textContent = !line && NARRATION[s.phase] ? NARRATION[s.phase]!.next : '다음';
    },
  };
}
