// data/scenarios의 모든 시나리오가 스키마·참조 검사를 통과하는지(새 회차 데이터 추가 시 자동 포함).
import { readdirSync, readFileSync } from 'node:fs';
import { loadScenario } from '../../src/engine/scenario/load';

const dir = 'data/scenarios';
describe.each(readdirSync(dir).filter((f) => f.endsWith('.json')))('%s', (f) => {
  it('loadScenario 통과', () => {
    expect(() => loadScenario(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))).not.toThrow();
  });
});
