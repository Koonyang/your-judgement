// 양형 천칭 접시 규칙(설계 5.8). 올리는 단위는 카드: 카드 X를 놓으면 X로 뒷받침되는 양형 인자·집유 사유가 모두 선택되고,
// 판결서 유리/불리 칸에는 X가 뒷받침하는 첫 양형 인자 id(없으면 카드 id)가 들어간다.
// 양형 인자의 방향은 양형기준상 고정이라 반대 접시에 놓으면 null(튕김). 형광펜 문장(hl:i)은 판결서에만, 쪽은 플레이어가 고른다.
import type { Scenario } from '../engine/scenario/schema';
import type { GameState } from '../engine/state';

export type Side = 'fav' | 'unfav';
export type PanItem = { id: string; label: string; src: '인자' | '카드' | '형광펜'; side: Side | null };
type Patch = { sentencing: Partial<GameState['sentencing']>; judgment: Partial<GameState['judgment']> };

const KEY: Record<Side, 'favorable' | 'unfavorable'> = { fav: 'favorable', unfav: 'unfavorable' };
const other = (x: Side): Side => (x === 'fav' ? 'unfav' : 'fav');
const plus = (xs: string[], ys: string[]) => [...xs, ...ys.filter((y) => !xs.includes(y))];
const minus = (xs: string[], ys: string[]) => xs.filter((x) => !ys.includes(x));

function supported(sc: Scenario, cardId: string) {
  const factors = sc.sentencing.factors.filter((f) => f.requiresAnyCard.includes(cardId));
  const susp = sc.sentencing.suspensionFactors.filter((f) => f.requiresAnyCard.includes(cardId));
  const fav = factors.some((f) => f.direction === 'mitigate') || susp.some((f) => f.direction === 'positive');
  const side: Side | null = factors.length + susp.length === 0 ? null : fav ? 'fav' : 'unfav';
  return { factors, susp, side, entry: factors[0]?.id ?? cardId };
}

export function panCandidates(sc: Scenario, s: GameState): PanItem[] {
  const cards = sc.cards
    .filter((x) => s.heldCards.includes(x.id))
    .flatMap((x): PanItem[] => {
      const sp = supported(sc, x.id);
      return sp.side ? [{ id: x.id, label: x.title, src: sp.factors.length ? '인자' : '카드', side: sp.side }] : [];
    });
  const hls = s.highlights.map((x, i): PanItem => ({ id: `hl:${i}`, label: x.text, src: '형광펜', side: null }));
  return [...cards, ...hls];
}

export function place(sc: Scenario, s: GameState, itemId: string, side: Side): Patch | null {
  const j = s.judgment;
  const toJudgment = (entry: string) => ({ [KEY[side]]: plus(j[KEY[side]], [entry]), [KEY[other(side)]]: minus(j[KEY[other(side)]], [entry]) });
  if (itemId.startsWith('hl:')) {
    if (!s.highlights[Number(itemId.slice(3))]) return null;
    return { sentencing: {}, judgment: toJudgment(itemId) };
  }
  if (!s.heldCards.includes(itemId)) return null;
  const sp = supported(sc, itemId);
  if (sp.side !== side) return null;
  const ids = (tier: 'special' | 'general') => sp.factors.filter((f) => f.tier === tier).map((f) => f.id);
  return {
    sentencing: {
      special: plus(s.sentencing.special, ids('special')),
      general: plus(s.sentencing.general, ids('general')),
      susp: plus(s.sentencing.susp, sp.susp.map((f) => f.id)),
    },
    judgment: toJudgment(sp.entry),
  };
}

export function remove(sc: Scenario, s: GameState, itemId: string): Patch {
  const j = s.judgment;
  const out = (entry: string) => ({ favorable: minus(j.favorable, [entry]), unfavorable: minus(j.unfavorable, [entry]) });
  if (itemId.startsWith('hl:')) return { sentencing: {}, judgment: out(itemId) };
  const sp = supported(sc, itemId);
  const fids = sp.factors.map((f) => f.id);
  return {
    sentencing: {
      special: minus(s.sentencing.special, fids),
      general: minus(s.sentencing.general, fids),
      susp: minus(s.sentencing.susp, sp.susp.map((f) => f.id)),
    },
    judgment: out(sp.entry),
  };
}
