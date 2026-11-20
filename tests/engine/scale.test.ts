// 천칭 표시 계산: 양형기준 평가 결과(영역·특별조정·종합 판단)를 그대로 따른다. 숫자 가중치를 새로 만들지 않는다.
import raw from '../../data/scenarios/ep01.json';
import { loadScenario } from '../../src/engine/scenario/load';
import { scaleView } from '../../src/engine/scale';

const sc = loadScenario(raw);
const F = (ids: string[]) => sc.sentencing.factors.filter((f) => ids.includes(f.id));
const S = (ids: string[]) => sc.sentencing.suspensionFactors.filter((f) => ids.includes(f.id));

describe('scaleView', () => {
  it('빈 천칭: 기본영역 6~18, 수평', () => {
    const v = scaleView(sc.sentencing, [], []);
    expect(v.tilt).toBe(0);
    expect(v.special.area).toBe('basic');
    expect(v.adjust.range).toEqual({ min: 6, max: 18 });
  });

  it('정석(생계형+처벌불원): 감경 특별조정 2~10, tilt -3', () => {
    const v = scaleView(sc.sentencing, F(['f_livelihood', 'f_nonpunish']), []);
    expect(v.special.areaRange).toEqual({ min: 4, max: 10 });
    expect(v.adjust).toEqual({ applied: true, range: { min: 2, max: 10 } });
    expect(v.special.mitigate.map((f) => f.id)).toEqual(['f_livelihood', 'f_nonpunish']);
    expect(v.tilt).toBe(-3);
  });

  it('처벌불원 철회(생계형만): 4~10, 조정 없음, tilt -2', () => {
    const v = scaleView(sc.sentencing, F(['f_livelihood']), []);
    expect(v.adjust).toEqual({ applied: false, range: { min: 4, max: 10 } });
    expect(v.tilt).toBe(-2);
  });

  it('일반인자만: 범위 그대로, 방향만', () => {
    const v = scaleView(sc.sentencing, F(['f_remorse']), []);
    expect(v.adjust.range).toEqual({ min: 6, max: 18 });
    expect(v.general.lean).toBe(-1);
    expect(v.tilt).toBe(-0.5);
  });

  it('일반 감경·가중이 같으면 방향 없음', () => {
    expect(scaleView(sc.sentencing, F(['f_remorse', 'f_prior']), []).general.lean).toBe(0);
  });

  it('집유 개수와 권고', () => {
    const v = scaleView(sc.sentencing, [], S(['s_livelihood', 's_nonpunish', 's_prior']));
    expect(v.susp).toEqual({ majorPos: 2, majorNeg: 1, genPos: 0, genNeg: 0, rec: 'discretion' });
  });
});
