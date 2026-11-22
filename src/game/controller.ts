// 게임 컨트롤러: GameState를 들고 액션을 순수 엔진(reduce)에 넘긴 뒤 구독자에게 알린다.
// DOM·Phaser 비의존 (Vitest node 환경에서 테스트).
import { reviewAppeal } from '../engine/appeal';
import { heardEntries, lineIndex } from '../engine/flow/lines';
import { currentLine, reduce } from '../engine/reducer';
import type { Exam, Line, Scenario, Speaker } from '../engine/scenario/schema';
import { initialState, type Action, type AppealOutcome, type GameState } from '../engine/state';

/** 화면에 보여 줄 한 줄. 엔진 라인이거나, 보충신문 재생용 줄(질문·답변). */
export type ShownLine = Pick<Line, 'speaker' | 'text'> & Partial<Pick<Line, 'id' | 'objection'>>;

type Listener = (s: GameState) => void;

export const SPEAKER_NAMES: Record<Speaker, string> = {
  judge: '재판장', clerk: '참여관', prosecutor: '검사', defense: '변호인', witness: '증인', defendant: '피고인', thought: '생각',
};

/** 신문 대상 표시 이름(괄호 설명 제외). */
export const examineeName = (exam: Pick<Exam, 'name'>) => exam.name.replace(/\s*\(.*\)\s*$/, '');

/** 신문 중 증인/피고인 화자면 신문 대상 이름, 아니면 기본 화자 이름. */
export function speakerLabel(sp: Speaker, exam: Exam | null | undefined): string {
  if (exam && ((sp === 'witness' && exam.kind === 'witness') || (sp === 'defendant' && exam.kind === 'defendant'))) {
    return examineeName(exam);
  }
  return SPEAKER_NAMES[sp];
}

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
  /** 쟁점 보드 회상 중이면 그 증언의 신문(이름표·법정 배치용). 재생 큐가 비면 끝난다. */
  private recallExam: Exam | null = null;
  private recallingNow = false;

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
    // 보충신문: 엔진이 이번에 들은 것(질문 + when 충족 답변)을 그대로 재생한다.
    if (a.type === 'ASK_SUPP') this.replay = heardEntries(this.sc, next, this.s.heard.length).map(({ line }) => ({ speaker: line.speaker, text: line.text }));
    if (next.phase === 'appeal' && this.s.phase !== 'appeal') this.outcome = reviewAppeal(this.sc, next);
    this.s = next;
    this.emit();
  }

  /** 재생 큐의 현재 줄을 넘긴다. */
  ack(): void {
    if (!this.replay.length) return;
    this.replay = this.replay.slice(1);
    if (!this.replay.length) {
      this.recallingNow = false;
      this.recallExam = null;
    }
    this.emit();
  }

  /** 카드의 회상 줄 중 실제로 들은 것(카드에 적힌 순서). */
  recallLines(cardId: string): ShownLine[] {
    const idx = lineIndex(this.sc);
    const ids = this.sc.cards.find((c) => c.id === cardId)?.recall ?? [];
    return ids.filter((id) => this.s.heard.includes(id)).flatMap((id) => {
      const e = idx.get(id);
      return e ? [{ speaker: e.line.speaker, text: e.line.text }] : [];
    });
  }

  /** 증언 카드를 눌러 그 증언을 다시 듣는다(엔진 상태 불변, 표시 전용). */
  recall(cardId: string): void {
    const lines = this.recallLines(cardId);
    if (!lines.length || this.replay.length) return;
    const idx = lineIndex(this.sc);
    const first = (this.sc.cards.find((c) => c.id === cardId)?.recall ?? []).map((id) => idx.get(id)).find((e) => e?.block === 'exam');
    this.recallExam = first ? this.sc.exams[first.examIndex] : null;
    this.recallingNow = true;
    this.replay = lines;
    this.emit();
  }

  get recalling(): boolean {
    return this.recallingNow;
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
    if (this.recallingNow) return this.recallExam;
    return this.s.phase === 'exam' ? this.sc.exams[this.s.cursor.examIndex] ?? null : null;
  }

  /** 화자 표시 이름. 신문 중 증인/피고인은 신문 대상 이름(괄호 설명 제외). */
  speakerName(sp: Speaker): string {
    return speakerLabel(sp, this.currentExam());
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn(this.s);
  }
}
