import raw from '../../data/scenarios/ep01.json';
import { Controller } from '../../src/game/controller';
import { loadScenario } from '../../src/engine/scenario/load';
import { reviewAppeal } from '../../src/engine/appeal';
import { initialState, type GameState } from '../../src/engine/state';

const sc = loadScenario(raw);

describe('Controller', () => {
  it('dispatch 후 subscribe 콜백이 새 상태로 1회 호출된다', () => {
    const c = new Controller(sc);
    const seen: GameState[] = [];
    c.subscribe((s) => seen.push(s));
    c.dispatch({ type: 'ADVANCE' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(c.state);
    expect(seen[0].phase).toBe('pretrial');
  });

  it('unsubscribe 후에는 호출되지 않는다', () => {
    const c = new Controller(sc);
    const fn = vi.fn();
    const off = c.subscribe(fn);
    off();
    c.dispatch({ type: 'ADVANCE' });
    expect(fn).not.toHaveBeenCalled();
    expect(c.state.phase).toBe('pretrial');
  });

  it('무효 액션(상태 불변)은 알리지 않는다', () => {
    const c = new Controller(sc);
    const fn = vi.fn();
    c.subscribe(fn);
    c.dispatch({ type: 'INTERRUPT' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('보충신문 질문 후 질문·답변을 재생 큐로 보여 주고 ack로 넘긴다', () => {
    const c = new Controller(sc);
    // 증인신문 보충신문까지 진행
    for (let i = 0; i < 200 && !(c.state.phase === 'exam' && c.state.cursor.inSupp); i++) {
      const line = c.shownLine();
      c.dispatch(line?.objection ? { type: 'RULE_OBJECTION', ruling: line.objection.correct } : line?.speak ? { type: 'SPEAK', speakId: line.speak.id } : { type: 'ADVANCE' });
    }
    expect(c.state.cursor.inSupp).toBe(true);
    const q = sc.exams[0].supplementary[0];
    const fn = vi.fn();
    c.subscribe(fn);
    c.dispatch({ type: 'ASK_SUPP', questionId: q.id });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.shownLine()).toMatchObject({ speaker: 'judge', text: q.text });
    c.ack();
    expect(c.shownLine()).toMatchObject({ text: q.answer[0].text });
    c.ack();
    expect(c.replaying).toBe(false);
    expect(c.shownLine()).toBeNull();
  });

  it('보충신문 재생 큐는 엔진이 새로 들은 진술(heard)과 같다', () => {
    const c = new Controller(sc);
    for (let i = 0; i < 200 && !(c.state.phase === 'exam' && c.state.cursor.inSupp); i++) {
      const line = c.shownLine();
      c.dispatch(line?.objection ? { type: 'RULE_OBJECTION', ruling: line.objection.correct } : line?.speak ? { type: 'SPEAK', speakId: line.speak.id } : { type: 'ADVANCE' });
    }
    const before = c.state.heard.length;
    const q = sc.exams[0].supplementary[0];
    c.dispatch({ type: 'ASK_SUPP', questionId: q.id });
    const fresh = c.state.heard.slice(before);
    expect(fresh[0]).toBe(q.id);
    const texts: string[] = [];
    while (c.replaying) {
      texts.push(c.shownLine()!.text);
      c.ack();
    }
    const answerText = (id: string) => q.answer.find((l) => l.id === id)!.text;
    expect(texts).toEqual([q.text, ...fresh.slice(1).map(answerText)]);
  });

  it('화자 이름: 증인은 현재 신문의 이름', () => {
    const c = new Controller(sc);
    expect(c.speakerName('judge')).toBe('재판장');
    expect(c.speakerName('witness')).toBe('증인');
  });

  it('appeal 단계에 들어설 때 reviewAppeal 결과를 계산해 들고, 엔진 상태는 건드리지 않는다', () => {
    const base = initialState(sc);
    const board = Object.fromEntries(sc.cells.map((x) => [x.id, { cards: ['c_cctv'], mark: 'proven' as const }]));
    const from: GameState = {
      ...base, phase: 'pronounce', heldCards: ['c_cctv'], board,
      sentencing: { ...base.sentencing, months: 6, suspended: true },
    };
    const c = new Controller(sc, from);
    expect(c.appealOutcome).toBeNull();
    c.dispatch({ type: 'FINISH_PRONOUNCE' });
    expect(c.state.phase).toBe('appeal');
    expect(c.state.outcome).toBeNull();
    expect(c.appealOutcome).toEqual(reviewAppeal(sc, c.state));
  });
});
