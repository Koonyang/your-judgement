// 쟁점 수 → 피고인 기물과 판 위 자리. 가장자리·구석에 두면 진짜 체스처럼 갈 수 있는 방향이 줄어든다.
// 3×3 판(체스 규칙은 버리고 기물의 이동 방향만 빌린다). 폰 1(앞), 룩 2(구석)·3(가장자리)·4(가운데), 퀸 5(가장자리)·8(가운데). 행 0이 판 위.
// shortcut: 6·7개는 자리로 못 만든다(loadScenario가 막음), 그런 회차가 생기면 막힌 방향을 둘 다른 장치가 필요
export type Dir = [number, number];
export const SIZE = 3;
export type Layout = { piece: 'pawn' | 'rook' | 'queen'; glyph: string; at: [number, number]; dirs: Dir[] };

const N: Dir = [-1, 0], NE: Dir = [-1, 1], E: Dir = [0, 1], SE: Dir = [1, 1], S: Dir = [1, 0], SW: Dir = [1, -1], W: Dir = [0, -1], NW: Dir = [-1, -1];

const LAYOUTS: Record<number, Layout> = {
  1: { piece: 'pawn', glyph: '♟', at: [2, 1], dirs: [N] },
  2: { piece: 'rook', glyph: '♜', at: [2, 0], dirs: [N, E] },
  3: { piece: 'rook', glyph: '♜', at: [2, 1], dirs: [W, N, E] },
  4: { piece: 'rook', glyph: '♜', at: [1, 1], dirs: [N, E, S, W] },
  5: { piece: 'queen', glyph: '♛', at: [2, 1], dirs: [W, NW, N, NE, E] },
  8: { piece: 'queen', glyph: '♛', at: [1, 1], dirs: [N, NE, E, SE, S, SW, W, NW] },
};

export function layoutFor(n: number): Layout {
  const l = LAYOUTS[n];
  if (!l) throw new Error(`쟁점 ${n}개는 판에 놓을 수 없음`);
  return l;
}

const ARROWS: Record<string, string> = { '-1,0': '↑', '-1,1': '↗', '0,1': '→', '1,1': '↘', '1,0': '↓', '1,-1': '↙', '0,-1': '←', '-1,-1': '↖' };
export const arrowOf = (d: Dir) => ARROWS[d.join(',')];
