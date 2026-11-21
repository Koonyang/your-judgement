import { normalizeNickname, sealLayout } from '../../src/ui/seal';

describe('도장 배치', () => {
  it('닉네임은 공백을 빼고 4자까지', () => {
    expect(normalizeNickname('  홍 길 동  ')).toBe('홍길동');
    expect(normalizeNickname('가나다라마')).toBe('가나다라');
    expect(normalizeNickname('😀😀😀😀😀')).toBe('😀😀😀😀');
  });

  it('비어 있으면 "판사" 세로 두 칸', () => {
    expect(sealLayout('')).toEqual({ cols: 1, rows: 2, cells: [{ ch: '판', col: 0, row: 0 }, { ch: '사', col: 0, row: 1 }] });
  });

  it('한 글자는 한 칸', () => {
    expect(sealLayout('정')).toEqual({ cols: 1, rows: 1, cells: [{ ch: '정', col: 0, row: 0 }] });
  });

  it('세 글자는 "인"을 붙여 오른쪽 열부터 세로로', () => {
    const l = sealLayout('홍길동');
    expect(l.cols).toBe(2);
    expect(l.cells.map((c) => `${c.ch}${c.col}${c.row}`)).toEqual(['홍10', '길11', '동00', '인01']);
  });
});
