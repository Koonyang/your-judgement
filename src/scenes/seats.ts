// 법정 좌석 배치와 플레이스홀더 색. 이미지 키는 화자 문자열 그대로 두어 나중에 스프라이트로 교체한다.
import type { Speaker } from '../engine/scenario/schema';

export type SeatKey = Speaker;

export const FONT_STACK =
  '"Galmuri11", "DungGeunMo", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "NanumGothic", "WenQuanYi Zen Hei", sans-serif';

/** 방청석에서 법대를 바라보는 구도. 좌석 위치 고증은 [확인필요] (task-9 보고서 참조). */
export const SEATS: Record<SeatKey, { x: number; y: number; label: string; color: number; labelSide?: boolean }> = {
  judge: { x: 640, y: 112, label: '재판장', color: 0x2b2b3a, labelSide: true },
  clerk: { x: 640, y: 236, label: '참여관', color: 0x4a5a6a },
  prosecutor: { x: 230, y: 330, label: '검사', color: 0x3a4a6e },
  defense: { x: 1000, y: 330, label: '변호인', color: 0x5a4a3a },
  defendant: { x: 1130, y: 350, label: '피고인', color: 0x6e6a5a },
  witness: { x: 640, y: 400, label: '증인', color: 0x6a5a7a },
};

export const SPRITE_W = 56;
export const SPRITE_H = 80;
