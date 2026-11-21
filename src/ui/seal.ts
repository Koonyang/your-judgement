// 판사 도장(인장) 글자 배치. 전통 인장처럼 세로쓰기, 오른쪽 열부터 읽는다.
// 1자: 한 칸 / 2자: 세로 두 칸 / 3자: 끝에 '인'을 붙여 2×2 / 4자: 2×2.

export const SEAL_MAX = 4;

/** 닉네임 정리: 공백 제거, 최대 4자(서로게이트 쌍도 한 글자로 센다). */
export function normalizeNickname(raw: string): string {
  return Array.from(raw.replace(/\s+/g, '')).slice(0, SEAL_MAX).join('');
}

export type SealCell = { ch: string; col: number; row: number };
export type SealLayout = { cols: number; rows: number; cells: SealCell[] };

export function sealLayout(name: string): SealLayout {
  const chars = Array.from(normalizeNickname(name) || '판사');
  if (chars.length === 3) chars.push('인');
  if (chars.length === 1) return { cols: 1, rows: 1, cells: [{ ch: chars[0], col: 0, row: 0 }] };
  if (chars.length === 2) return { cols: 1, rows: 2, cells: chars.map((ch, row) => ({ ch, col: 0, row })) };
  // 4자: 오른쪽 열(col 1) 위→아래, 그다음 왼쪽 열(col 0)
  return { cols: 2, rows: 2, cells: chars.map((ch, i) => ({ ch, col: i < 2 ? 1 : 0, row: i % 2 })) };
}
