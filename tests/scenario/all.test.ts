// data/scenarios의 모든 시나리오가 스키마·참조 검사를 통과하는지(새 회차 데이터 추가 시 자동 포함).
import { loadScenario } from '../../src/engine/scenario/load';

const files = import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' });
describe.each(Object.entries(files))('%s', (_name, raw) => {
  it('loadScenario 통과', () => {
    expect(() => loadScenario(raw)).not.toThrow();
  });
});
