// 시나리오 경로 테스트용 액션열 실행 헬퍼.
import { currentLine, reduce } from '../../src/engine/reducer';
import type { Scenario } from '../../src/engine/scenario/schema';
import { initialState, type Action, type GameState, type Phase } from '../../src/engine/state';

/** 목적지까지 ADVANCE를 반복하는 단계. 대사가 늘거나 줄어도 테스트를 고칠 필요가 없게 줄 id·보충신문·단계로 가리킨다. */
export type To = { to: string };
export type Step = Action | To;

/** 줄 id(그 줄이 화면에 뜬 상태)까지 */
export const to = (lineId: string): To => ({ to: lineId });
/** 현재 신문의 보충신문 선택 화면까지 */
export const toSupp = (): To => ({ to: '@supp' });
/** 단계 진입까지 */
export const toPhase = (p: Phase): To => ({ to: `phase:${p}` });

function reached(sc: Scenario, s: GameState, target: string): boolean {
  if (target === '@supp') return s.cursor.inSupp;
  if (target.startsWith('phase:')) return s.phase === target.slice(6);
  return !s.cursor.inSupp && currentLine(sc, s)?.id === target;
}

const where = (sc: Scenario, s: GameState) => `${s.phase}/${currentLine(sc, s)?.id ?? (s.cursor.inSupp ? '(보충신문)' : '-')}`;

/**
 * 초기 상태에서 steps를 차례로 적용한다.
 * 상태를 바꾸지 못한 액션(리듀서가 같은 객체를 돌려준 경우)은 경로가 어긋났다는 뜻이므로 즉시 던진다.
 */
export function play(sc: Scenario, steps: Step[], from: GameState = initialState(sc)): GameState {
  let s = from;
  steps.forEach((a, i) => {
    if ('to' in a) {
      for (let n = 0; !reached(sc, s, a.to); n++) {
        const next = reduce(sc, s, { type: 'ADVANCE' });
        if (next === s || n > 500) throw new Error(`단계 #${i} ${a.to}에 닿지 못함 (위치 ${where(sc, s)})`);
        s = next;
      }
      return;
    }
    const next = reduce(sc, s, a);
    if (next === s) throw new Error(`액션 #${i} ${JSON.stringify(a)} 무효 (위치 ${where(sc, s)})`);
    s = next;
  });
  return s;
}

export const adv = (n: number): Action[] => Array.from({ length: n }, () => ({ type: 'ADVANCE' }) as const);
