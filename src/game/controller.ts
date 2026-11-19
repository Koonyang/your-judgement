// 게임 컨트롤러: GameState를 들고 액션을 순수 엔진(reduce)에 넘긴 뒤 구독자에게 알린다.
// DOM·Phaser 비의존 (Vitest node 환경에서 테스트).
import { reviewAppeal } from '../engine/appeal';
import { evalCond } from '../engine/cond';
import { currentLine, reduce, suppFlag } from '../engine/reducer';
import type { Line, Scenario, Speaker } from '../engine/scenario/schema';
import { initialState, type Action, type AppealOutcome, type GameState } from '../engine/state';

/** 화면에 보여 줄 한 줄. 엔진 라인이거나, 보충신문 재생용 줄(질문·답변). */
export type ShownLine = Pick<Line, 'speaker' | 'text'> & Partial<Pick<Line, 'id' | 'objection'>>;

type Listener = (s: GameState) => void;

const SPEAKER_NAMES: Record<Speaker, string> = {
  judge: '재판장', clerk: '참여관', prosecutor: '검사', defense: '변호인', witness: '증인', defendant: '피고인',
};

export class Controller {
  private s: GameState;
  private listeners = new Set<Listener>();
  /**
   * 보충신문 재생 큐. 엔진은 ASK_SUPP 한 번에 답변까지 "들은 것"으로 처리하므로,
   * 화면은 질문과 답변을 이 큐로 한 줄씩 보여 준다(엔진 상태와 무관한 표시 전용).
   */
  private replay: ShownLine[] = [];
  /** 항소 판정 결과. 리듀서는 outcome을 채우지 않으므로 appeal 단계에 들어설 때 여기서 계산해 둔다. */
  private outcome: AppealOutcome | null = null;

  constructor(readonly sc: Scenario, from: GameState = initialState(sc)) {
    this.s = from;
  }

  get state(): GameState {
    return this.s;
  }

  /** appeal 단계 진입 시 계산한 reviewAppeal 결과(그 전에는 null). */
  get appealOutcome(): AppealOutcome | null {
    return this.outcome;
  }

  get replaying(): boolean {
    return this.replay.length > 0;
  }

  /** 엔진 액션 전달. 상태가 바뀌지 않으면(무효·무시된 액션) 아무것도 알리지 않는다. */
  dispatch(a: Action): void {
    const next = reduce(this.sc, this.s, a);
    if (next === this.s) return;
    if (a.type === 'ASK_SUPP') this.replay = this.suppReplay(a.questionId, this.s);
    if (next.phase === 'appeal' && this.s.phase !== 'appeal') this.outcome = reviewAppeal(this.sc, next);
    this.s = next;
    this.emit();
  }

  /** 재생 큐의 현재 줄을 넘긴다. */
  ack(): void {
    if (!this.replay.length) return;
    this.replay = this.replay.slice(1);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 지금 대사창에 보일 줄: 재생 큐 우선, 없으면 엔진의 현재 라인. */
  shownLine(): ShownLine | null {
    return this.replay[0] ?? currentLine(this.sc, this.s);
  }

  /** 현재 신문(exam 단계일 때). */
  currentExam() {
    return this.s.phase === 'exam' ? this.sc.exams[this.s.cursor.examIndex] ?? null : null;
  }

  /** 화자 표시 이름. 신문 중 증인/피고인은 신문 대상 이름(괄호 설명 제외). */
  speakerName(sp: Speaker): string {
    const exam = this.currentExam();
    if (exam && ((sp === 'witness' && exam.kind === 'witness') || (sp === 'defendant' && exam.kind === 'defendant'))) {
      return exam.name.replace(/\s*\(.*\)\s*$/, '');
    }
    return SPEAKER_NAMES[sp];
  }

  private suppReplay(questionId: string, before: GameState): ShownLine[] {
    const q = this.sc.exams[before.cursor.examIndex]?.supplementary.find((x) => x.id === questionId);
    if (!q) return [];
    // 엔진(askSupp)과 같은 순서로 when을 평가한다.
    const flags = new Set([...before.flags, suppFlag(q.id)]);
    const answers: ShownLine[] = [];
    for (const l of q.answer) {
      if (!evalCond(l.when, flags)) continue;
      l.sets?.forEach((f) => flags.add(f));
      answers.push({ speaker: l.speaker, text: l.text });
    }
    return [{ speaker: 'judge', text: q.text }, ...answers];
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn(this.s);
  }
}
