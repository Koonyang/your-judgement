// 시나리오 경로 테스트용 액션열 실행 헬퍼.
import { currentLine, reduce } from '../../src/engine/reducer';
import type { Scenario } from '../../src/engine/scenario/schema';
import { initialState, type Action, type GameState } from '../../src/engine/state';

/**
 * 초기 상태에서 actions를 차례로 적용한다.
 * 상태를 바꾸지 못한 액션(리듀서가 같은 객체를 돌려준 경우)은 경로가 어긋났다는 뜻이므로 즉시 던진다.
 */
export function play(sc: Scenario, actions: Action[], from: GameState = initialState(sc)): GameState {
  let s = from;
  actions.forEach((a, i) => {
    const next = reduce(sc, s, a);
    if (next === s) {
      const at = `${s.phase}/${currentLine(sc, s)?.id ?? (s.cursor.inSupp ? '(보충신문)' : '-')}`;
      throw new Error(`액션 #${i} ${JSON.stringify(a)} 무효 (위치 ${at})`);
    }
    s = next;
  });
  return s;
}

export const adv = (n: number): Action[] => Array.from({ length: n }, () => ({ type: 'ADVANCE' }) as const);
