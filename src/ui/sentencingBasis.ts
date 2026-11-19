// 양형 권고 계산 기준 (Ruling R11).
// - 기록상 권고(항소심 기준): 보유 카드로 뒷받침되는 인자 전부. reviewAppeal과 같은 기준.
// - 선택한 인자 기준: 플레이어가 체크한 인자만(판결서 양형 이유용). 화면에 보조로만 보인다.
// 1화 참여관 안내·여유폭·"범위 밖" 표시는 항상 기록상 권고를 쓴다.
import { heldCardSet } from '../engine/reducer';
import type { Scenario } from '../engine/scenario/schema';
import {
  availableFactors, recommendedRange, suspensionRecommendation, type Area,
} from '../engine/sentencing';
import type { GameState } from '../engine/state';
import type { Range } from '../engine/scenario/schema';

export type Basis = {
  area: Area;
  range: Range;
  adjusted: boolean;
  judgmentCall: boolean;
  susp: 'suspend' | 'prison' | 'discretion';
};

/** 기록상 권고(항소심 기준): 보유 카드로 뒷받침되는 인자 전부. */
export function recordBasis(sc: Scenario, s: GameState): Basis {
  const held = heldCardSet(s);
  const special = availableFactors(sc.sentencing.factors, held).filter((f) => f.tier === 'special');
  const r = recommendedRange(sc.sentencing, special);
  return { ...r, susp: suspensionRecommendation(availableFactors(sc.sentencing.suspensionFactors, held)) };
}

/** 선택한 인자 기준: 체크한 인자 중 보유 카드로 뒷받침되는 것만. */
export function selectedBasis(sc: Scenario, s: GameState): Basis {
  const held = heldCardSet(s);
  const special = availableFactors(sc.sentencing.factors, held)
    .filter((f) => f.tier === 'special' && s.sentencing.special.includes(f.id));
  const susp = availableFactors(sc.sentencing.suspensionFactors, held).filter((f) => s.sentencing.susp.includes(f.id));
  return { ...recommendedRange(sc.sentencing, special), susp: suspensionRecommendation(susp) };
}

export const sameBasis = (a: Basis, b: Basis) =>
  a.area === b.area && a.range.min === b.range.min && a.range.max === b.range.max && a.susp === b.susp;
