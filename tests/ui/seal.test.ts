import { normalizeNickname, sealLayout } from '../../src/ui/seal';

const pos = (name: string) => sealLayout(name).cells.map((c) => `${c.ch}@${c.x},${c.y}`);

describe('닉네임 도장 배치', () => {
  it('공백을 빼고 8자까지', () => {
    expect(normalizeNickname('  밤 의 판 사  ')).toBe('밤의판사');
    expect(normalizeNickname('abcdefghij')).toBe('abcdefgh');
    expect(normalizeNickname('😀😀😀😀😀😀😀😀😀')).toHaveLength(16); // 8글자(서로게이트 쌍)
  });

  it('비어 있으면 "판사" 세로 두 칸', () => {
    expect(sealLayout('')).toMatchObject({ cols: 1, rows: 2, vertical: true });
  });

  it('한글은 오른쪽 열부터 세로로, 덜 찬 열은 세로 가운데', () => {
    expect(pos('정')).toEqual(['정@0.5,0.5']);
    const three = sealLayout('달토끼');
    expect([three.cols, three.rows]).toEqual([2, 2]);
    expect(pos('달토끼')).toEqual(['달@1.5,0.5', '토@1.5,1.5', '끼@0.5,1']);
    const five = sealLayout('가나다라마');
    expect([five.cols, five.rows]).toEqual([2, 3]);
    expect(five.cells[4]).toEqual({ ch: '마', x: 0.5, y: 2 }); // 왼쪽 열 2자는 3행 안 가운데
  });

  it('영문·숫자·섞인 닉네임은 가로쓰기, 6자부터 두 줄', () => {
    expect(sealLayout('Neo')).toMatchObject({ cols: 3, rows: 1, vertical: false, narrow: true });
    expect(sealLayout('판사K')).toMatchObject({ vertical: false, narrow: false, rows: 1 });
    const seven = sealLayout('judge07');
    expect([seven.cols, seven.rows]).toEqual([4, 2]);
    expect(seven.cells[6]).toEqual({ ch: '7', x: 3, y: 1.5 }); // 아랫줄 3자 가운데 정렬
  });
});
