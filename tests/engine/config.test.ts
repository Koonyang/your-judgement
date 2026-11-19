import { LEEWAY_RATIO, PROSECUTOR_APPEAL_RATIO, DOUBLE_COUNT_FACTOR } from '../../src/engine/config';
test('tunables', () => {
  expect(LEEWAY_RATIO).toBe(0.2);
  expect(PROSECUTOR_APPEAL_RATIO).toBe(0.5);
  expect(DOUBLE_COUNT_FACTOR).toBe(0.5);
});
