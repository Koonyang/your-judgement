// 튜닝 상수는 이 파일에만 둔다. (엔진은 phaser/DOM 비의존)
/** 양형 허용 오차 비율 */
export const LEEWAY_RATIO = 0.2;
/** 검사 항소 기준 비율 */
export const PROSECUTOR_APPEAL_RATIO = 0.5;
/** 이중 평가(double counting) 감쇠 계수 */
export const DOUBLE_COUNT_FACTOR = 0.5;
/** 집행유예 가능한 형의 상한(개월). 형법 §62 "3년 이하" [확인필요] */
export const SUSPENSION_MAX_MONTHS = 36;
/** 1화 집행유예 기간(년). 회차 데이터로 옮길 수 있음 [todoVerify] */
export const SUSPENSION_PERIOD_YEARS = 1;
