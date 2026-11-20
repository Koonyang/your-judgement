// 양형 천칭 표시용 계산. 기울기는 별도 무게 합이 아니라 기존 양형기준 평가(영역·특별조정·종합 판단)에서 나온다.
// 판정 로직이 아니라 화면 설명용이며, 기존 함수만 호출한다.
import type { Factor, Range, Scenario, SuspFactor } from './scenario/schema';
import { evaluateArea, recommendedRange, suspensionRecommendation, type Area } from './sentencing';

export type ScaleView = {
  /** 음수 = 유리(감경) 쪽, 양수 = 불리(가중) 쪽. -3..3 */
  tilt: number;
  /** 종합 판단(judgmentCall): 수평 근처에서 흔들리는 연출 */
  wobble: boolean;
  special: { mitigate: Factor[]; aggravate: Factor[]; area: Area; areaRange: Range };
  /** 특별조정 후(없으면 areaRange와 같다) */
  adjust: { applied: boolean; range: Range };
  general: { mitigate: Factor[]; aggravate: Factor[]; lean: -1 | 0 | 1 };
  susp: { majorPos: number; majorNeg: number; genPos: number; genNeg: number; rec: 'suspend' | 'prison' | 'discretion' };
};

const AREA_TILT: Record<Area, number> = { mitigated: -2, basic: 0, aggravated: 2 };

export function scaleView(s: Scenario['sentencing'], factors: Factor[], susp: SuspFactor[]): ScaleView {
  const special = factors.filter((f) => f.tier === 'special');
  const general = factors.filter((f) => f.tier === 'general');
  const { area } = evaluateArea(special);
  const r = recommendedRange(s, special);
  const gm = general.filter((f) => f.direction === 'mitigate');
  const ga = general.filter((f) => f.direction === 'aggravate');
  const lean = Math.sign(ga.length - gm.length) as -1 | 0 | 1;
  const count = (tier: SuspFactor['tier'], dir: SuspFactor['direction']) =>
    susp.filter((x) => x.tier === tier && x.direction === dir).length;
  return {
    tilt: AREA_TILT[area] + (r.adjusted ? Math.sign(AREA_TILT[area]) : 0) + lean * 0.5,
    wobble: r.judgmentCall,
    special: {
      mitigate: special.filter((f) => f.direction === 'mitigate'),
      aggravate: special.filter((f) => f.direction === 'aggravate'),
      area,
      areaRange: s.ranges[area],
    },
    adjust: { applied: r.adjusted, range: r.range },
    general: { mitigate: gm, aggravate: ga, lean },
    susp: {
      majorPos: count('major', 'positive'), majorNeg: count('major', 'negative'),
      genPos: count('general', 'positive'), genNeg: count('general', 'negative'),
      rec: suspensionRecommendation(susp),
    },
  };
}
