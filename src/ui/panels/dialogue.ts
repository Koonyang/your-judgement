// 대사 줄(화면 맨 아래 y290–360): 초상 + 화자·대사, 이의 결정·보충신문 질문. 제지는 책상의 마이크(overlay).
// 설계 규칙: 어떤 라인이 제지 가능한지 표시하지 않는다. 제지가 무시돼도 반응하지 않는다.
import type { Controller } from '../../game/controller';
import { suppFlag } from '../../engine/reducer';
import type { GameState } from '../../engine/state';
import { button, h, show } from '../dom';
import { SEATS, type SeatKey } from '../../scenes/seats';
import { blip, getSettings, play } from '../audio';
import type { Panel } from './types';

/** 라인이 없는 단계의 안내문과 [다음] 버튼 문구. */
const NARRATION: Partial<Record<GameState['phase'], { text: string; next: string }>> = {
  pretrial: { text: '공판 전에는 공소장과 피고인 의견서만 볼 수 있습니다. 준비가 되면 공판을 엽니다.', next: '공판 개정' },
  evidence: {
    text: '증거조사. 동의한 증거는 채택해 조사한다. 동의하지 않은 조서는 표목만 남고, 진술한 사람을 불러 직접 들어야 한다.',
    next: '증인신문으로',
  },
  review: { text: '선고기일 전 재검토. 책상의 기록을 집어 자유롭게 열람할 수 있습니다.', next: '선고기일로' },
};
const BLOCK_END: Partial<Record<GameState['phase'], string>> = {
  opening: '모두절차를 마칩니다.',
};

const MS_PER_CHAR = { normal: 32, fast: 14, instant: 0 } as const;
/** 문장 부호 뒤 숨 고르기(ms). 말투의 호흡이 된다. */
const PAUSE: Record<string, number> = { ',': 90, '、': 90, '.': 170, '?': 190, '!': 170, '…': 220, ':': 100 };
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createDialoguePanel(c: Controller): Panel {
  const speaker = h('div', { class: 'speaker', testid: 'dialogue-speaker' });
  const text = h('div', { class: 'text', testid: 'dialogue-text' });
  const note = h('div', { class: 'note', testid: 'dialogue-note' });
  const supp = h('div', { class: 'supp', testid: 'supp-list' });
  // 글자 타이핑: DOM에는 늘 전체 글이 있고(레이아웃·읽기 도구가 흔들리지 않게) 아직 안 찍힌 부분만 투명하다.
  let typedKey = '';
  let timer = 0;
  let full = '';
  let shown = 0;
  const untyped = h('span', { class: 'untyped' });
  const typing = () => timer !== 0;
  const paint = () => {
    if (shown >= full.length) return text.replaceChildren(full);
    untyped.textContent = full.slice(shown);
    text.replaceChildren(full.slice(0, shown), untyped);
  };
  const finishTyping = () => {
    clearTimeout(timer);
    timer = 0;
    shown = full.length;
    paint();
  };
  function startTyping(key: string, str: string, who: string): void {
    typedKey = key;
    clearTimeout(timer);
    timer = 0;
    full = str;
    shown = 0;
    const per = reducedMotion() ? 0 : MS_PER_CHAR[getSettings().speed];
    if (!per || !str) {
      shown = str.length;
      paint();
      if (str) blip(who, str[0]); // 즉시 표시여도 말하는 소리는 한 번
      return;
    }
    paint();
    let n = 0;
    const tick = () => {
      if (el.hidden) return finishTyping();
      const ch = full[shown++];
      paint();
      if (ch.trim() && !(ch in PAUSE) && n++ % 2 === 0) blip(who, ch); // 두 글자에 한 번
      if (shown >= full.length) { timer = 0; return; }
      timer = window.setTimeout(tick, per + (PAUSE[ch] ?? 0));
    };
    timer = window.setTimeout(tick, per);
  }
  /** 이 줄에서 새로 울릴 신호음(이의·필수 발언)은 한 번만. */
  let cueKey = '';

  const next = button('btn-next', '▼', () => {
    if (typing()) return finishTyping(); // 첫 입력은 글을 끝까지 보여 주고, 다음 입력이 넘긴다
    return c.replaying ? c.ack() : c.dispatch({ type: 'ADVANCE' });
  }, 'btn primary');
  const rule = (ruling: 'sustain' | 'overrule') => () => { play('ruling'); c.dispatch({ type: 'RULE_OBJECTION', ruling }); };
  const sustain = button('btn-sustain', '인용', rule('sustain'));
  const overrule = button('btn-overrule', '기각', rule('overrule'));
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
  const actions = h('div', { class: 'actions' }, hlClosing, sustain, overrule, suppEnd, next);
  const portrait = h('div', { class: 'portrait', testid: 'dialogue-portrait' });
  const body = h('div', { class: 'dl-body' }, h('div', {}, speaker, text), note);
  const el = h('section', { class: 'dialogue', testid: 'panel-dialogue' }, portrait, body, actions, supp);

  return {
    el,
    render(s, sc) {
      const line = c.shownLine();
      const examSupp = s.phase === 'exam' && s.cursor.inSupp && !c.replaying;
      const objection = !c.replaying && line?.objection ? line.objection : null;

      const spoken = !!line && line.speaker !== 'thought';
      speaker.textContent = line ? c.speakerName(line.speaker) : '';
      show(speaker, spoken);
      // 초상 플레이스홀더: 좌석 색 + 이름 첫 글자. 나중에 같은 화자 키로 그림 교체.
      show(portrait, spoken);
      if (line && spoken) {
        portrait.dataset.speaker = line.speaker;
        portrait.style.background = `#${SEATS[line.speaker as SeatKey].color.toString(16).padStart(6, '0')}`;
        portrait.textContent = speaker.textContent.slice(0, 1);
      }
      if (line) {
        // 같은 줄이 다시 그려져도(상태가 바뀌어도) 타이핑을 처음부터 다시 하지 않는다.
        const key = `${c.replaying ? 'r' : 's'}|${line.id ?? ''}|${line.speaker}|${line.text}`;
        if (key !== typedKey) startTyping(key, line.text, line.speaker);
        if (key !== cueKey) {
          cueKey = key;
          if (!c.replaying && line.objection) play('objection');
          else if (!c.replaying && line.speak) play('call');
        }
      } else {
        const str = examSupp
          ? '보충신문. 재판장이 직접 물어볼 것이 있으면 고르십시오.'
          : NARRATION[s.phase]?.text ?? BLOCK_END[s.phase] ?? '';
        if (typedKey !== `n|${str}`) { typedKey = `n|${str}`; cueKey = ''; finishTyping(); full = str; shown = str.length; paint(); }
      }
      text.classList.toggle('narration', !spoken);

      const tutorial = !c.replaying && !objection ? line?.tutorial ?? '' : '';
      note.textContent = objection ? `${objection.by === 'defense' ? '변호인이' : '검사가'} 이의를 제기했습니다.` : tutorial;
      note.classList.toggle('tutorial', !!tutorial);
      show(note, !!note.textContent);

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

      show(sustain, !!objection);
      show(overrule, !!objection);
      show(suppEnd, examSupp);
      const closingStmt = s.phase === 'closing' && line?.speaker === 'defendant';
      show(hlClosing, closingStmt);
      show(next, !objection && !examSupp && !(line?.speak && !c.replaying));
      // 대사는 화면을 눌러 넘긴다(▼는 그 표시). 절차를 바꾸는 버튼만 글자로.
      next.textContent = !line && NARRATION[s.phase] ? NARRATION[s.phase]!.next : '▼';
      next.classList.toggle('tap', next.textContent === '▼');
    },
  };
}
