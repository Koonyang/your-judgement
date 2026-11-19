// 기록상 권고(UI)는 항소심(reviewAppeal)과 같은 기준이어야 한다 (R11).
import raw from '../../data/scenarios/ep01.json';
import { loadScenario } from '../../src/engine/scenario/load';
import { availableFactors, recommendedRange, suspensionRecommendation } from '../../src/engine/sentencing';
import { initialState, type GameState } from '../../src/engine/state';
import { recordBasis, sameBasis, selectedBasis } from '../../src/ui/sentencingBasis';

const sc = loadScenario(raw);
const held = ['c_livelihood', 'c_nonpunish', 'c_record', 'c_remorse'];
const s: GameState = {
  ...initialState(sc), phase: 'sentencing', heldCards: held,
  sentencing: { special: ['f_livelihood', 'f_nonpunish'], general: [], susp: ['s_livelihood', 's_nonpunish'], months: 6, suspended: true },
};

describe('sentencingBasis', () => {
  it('recordBasis는 보유 카드로 가능한 인자 전부로 계산한다(체크와 무관)', () => {
    const hs = new Set(held);
    const all = availableFactors(sc.sentencing.factors, hs).filter((f) => f.tier === 'special');
    const b = recordBasis(sc, { ...s, sentencing: { ...s.sentencing, special: [], susp: [] } });
    expect(b.range).toEqual(recommendedRange(sc.sentencing, all).range);
    expect(b.susp).toBe(suspensionRecommendation(availableFactors(sc.sentencing.suspensionFactors, hs)));
    expect(b.susp).toBe('discretion'); // 동종 전과(주요 부정)까지 들어가 종합 판단
  });

  it('selectedBasis는 체크한 인자만 쓴다', () => {
    const b = selectedBasis(sc, s);
    expect(b.susp).toBe('suspend');
    expect(sameBasis(b, recordBasis(sc, s))).toBe(false);
  });
});
