// 법정 좌석 배치와 플레이스홀더 색. 이미지 키는 화자 문자열 그대로 두어 나중에 스프라이트로 교체한다.
import type { Speaker } from '../engine/scenario/schema';

export type SeatKey = Speaker;

export const FONT_STACK =
  '"Galmuri11", "DungGeunMo", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "NanumGothic", "WenQuanYi Zen Hei", sans-serif';

/**
 * 판사 시점(법대에서 내려다봄), 법정 띠 640×150 논리 좌표. 재판장은 플레이어라 그리지 않는다(hidden).
 * 좌우 배치(검사 왼쪽, 변호인·피고인 오른쪽)는 임시 [확인필요].
 */
export const SEATS: Record<SeatKey, { x: number; y: number; label: string; color: number; hidden?: boolean; back?: boolean; scale?: number }> = {
  judge: { x: 320, y: 160, label: '재판장', color: 0x16171c, hidden: true },
  clerk: { x: 320, y: 140, label: '참여관', color: 0x1d2028, back: true },
  prosecutor: { x: 92, y: 98, label: '검사', color: 0x1d2633 },
  defense: { x: 520, y: 98, label: '변호인', color: 0x2a2620 },
  defendant: { x: 566, y: 100, label: '피고인', color: 0x3a3a3a },
  witness: { x: 320, y: 92, label: '증인', color: 0x2f3440, scale: 1.5 },
};

export const SPRITE_W = 14;
export const SPRITE_H = 22;
/** 법정 띠 높이(논리 픽셀). 그 아래는 HTML 대사 줄과 책상. */
export const COURT_H = 150;
