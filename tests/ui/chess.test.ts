import { layoutFor } from '../../src/ui/chess';

const ROOK = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const QUEEN = [...ROOK, [-1, 1], [1, 1], [1, -1], [-1, -1]];
const inBoard = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3;

describe('layoutFor: 판 가장자리가 나머지 방향을 막는다', () => {
  for (const n of [1, 2, 3, 4, 5, 8]) {
    it(`쟁점 ${n}개`, () => {
      const l = layoutFor(n);
      expect(l.dirs).toHaveLength(n);
      const [r, c] = l.at;
      for (const [dr, dc] of l.dirs) expect(inBoard(r + dr, c + dc)).toBe(true);
      if (l.piece === 'pawn') return;
      const all = l.piece === 'rook' ? ROOK : QUEEN;
      // 그 기물이 그 자리에서 실제로 갈 수 있는 방향 수 = 쟁점 수
      expect(all.filter(([dr, dc]) => inBoard(r + dr, c + dc))).toHaveLength(n);
    });
  }
  it('없는 개수는 던진다', () => expect(() => layoutFor(6)).toThrow());
});
