import {
  LEEWAY_RATIO, PROSECUTOR_APPEAL_RATIO, DOUBLE_COUNT_FACTOR, SUSPENSION_MAX_MONTHS, SUSPENSION_PERIOD_YEARS,
} from '../../src/engine/config';
test('tunables', () => {
  expect(LEEWAY_RATIO).toBe(0.2);
  expect(PROSECUTOR_APPEAL_RATIO).toBe(0.5);
  expect(DOUBLE_COUNT_FACTOR).toBe(0.5);
  expect(SUSPENSION_MAX_MONTHS).toBe(36);
  expect(SUSPENSION_PERIOD_YEARS).toBe(1);
});
