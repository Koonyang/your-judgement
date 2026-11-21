// 판사 도장(닉네임 인장) 글자 배치. 닉네임 글자 수·문자 종류에 따라 도장 모양이 정해진다.
// - 한글·한자만: 전통 인장처럼 세로쓰기, 오른쪽 열부터. 열 수 = 행 수에 맞춘 거의 정사각형, 덜 찬 마지막 열은 세로 가운데.
// - 그 밖(영문·숫자·섞임): 가로쓰기. 5자까지 한 줄, 그 이상은 두 줄(아랫줄 가운데). 가로로 긴 도장이 된다.

export const SEAL_MAX = 8;

/** 닉네임 정리: 공백 제거, 최대 8자(서로게이트 쌍도 한 글자로 센다). */
export function normalizeNickname(raw: string): string {
  return Array.from(raw.replace(/\s+/g, '')).slice(0, SEAL_MAX).join('');
}

const VERTICAL = /^[가-힣ㄱ-ㆎ一-鿿]+$/u;

/** x·y는 칸 단위 중심 좌표(왼쪽 위 0,0 ~ cols,rows). */
export type SealCell = { ch: string; x: number; y: number };
/** narrow: 영문·숫자만이면 칸 폭을 좁힌다(반각 글자). */
export type SealLayout = { cols: number; rows: number; vertical: boolean; narrow: boolean; cells: SealCell[] };

export function sealLayout(name: string): SealLayout {
  const chars = Array.from(normalizeNickname(name) || '판사');
  const n = chars.length;
  const vertical = VERTICAL.test(chars.join(''));
  if (vertical) {
    const rows = n <= 2 ? n : Math.ceil(Math.sqrt(n));
    const cols = Math.ceil(n / rows);
    const cells = chars.map((ch, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const inCol = Math.min(rows, n - col * rows); // 이 열에 든 글자 수
      return { ch, x: cols - col - 0.5, y: row + 0.5 + (rows - inCol) / 2 };
    });
    return { cols, rows, vertical, narrow: false, cells };
  }
  const rows = n <= 5 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const cells = chars.map((ch, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    return { ch, x: col + 0.5 + (cols - inRow) / 2, y: row + 0.5 };
  });
  return { cols, rows, vertical, narrow: /^[\x21-\x7e]+$/.test(chars.join('')), cells };
}

/** 도장 크기(px): 긴 변이 대략 side가 되도록 칸 크기를 정한다. 글자가 많아도 칸이 minCell보다 작아지지 않는다. */
export function sealBox(l: SealLayout, side: number, minCell: number) {
  const cell = Math.max(minCell, Math.min(side * 0.6, side / Math.max(l.cols, l.rows)));
  const cw = l.narrow ? cell * 0.62 : cell; // 칸 폭
  const pad = Math.round(cell * 0.18);
  return { cell, cw, pad, w: l.cols * cw + pad * 2, h: l.rows * cell + pad * 2, font: Math.round(cell * 0.78) };
}
