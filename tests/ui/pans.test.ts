// 천칭 접시 규칙: 카드 단위로 올리고, 양형 인자 방향과 반대 접시는 튕긴다. 한 동작이 양형 선택과 판결서 유리/불리를 같이 채운다.
import raw from '../../data/scenarios/ep01.json';
import { loadScenario } from '../../src/engine/scenario/load';
import { initialState, type GameState } from '../../src/engine/state';
import { panCandidates, place, remove } from '../../src/ui/pans';

const sc = loadScenario(raw);
const s: GameState = {
  ...initialState(sc), phase: 'sentencing', heldCards: sc.cards.map((x) => x.id),
  highlights: [{ docId: 'closing', text: '다시는 그러지 않겠습니다.' }],
};
type Patch = NonNullable<ReturnType<typeof place>>;
const apply = (st: GameState, p: Patch): GameState => ({
  ...st, sentencing: { ...st.sentencing, ...p.sentencing }, judgment: { ...st.judgment, ...p.judgment },
});

describe('pans', () => {
  it('처벌불원 카드는 유리 쪽: 인자+집유 사유+판결서 유리', () => {
    const p = place(sc, s, 'c_nonpunish', 'fav')!;
    expect(p.sentencing.special).toContain('f_nonpunish');
    expect(p.sentencing.susp).toContain('s_nonpunish');
    expect(p.judgment.favorable).toContain('f_nonpunish');
  });

  it('반대 접시는 튕김', () => {
    expect(place(sc, s, 'c_nonpunish', 'unfav')).toBeNull();
  });

  it('전과 카드는 불리 고정', () => {
    expect(place(sc, s, 'c_record', 'fav')).toBeNull();
    const p = place(sc, s, 'c_record', 'unfav')!;
    expect(p.judgment.unfavorable).toContain('f_prior');
    expect(p.sentencing.general).toContain('f_prior');
  });

  it('피해 경미(집유 사유만)는 카드 id로 판결서에', () => {
    const p = place(sc, s, 'c_minor', 'fav')!;
    expect(p.judgment.favorable).toContain('c_minor');
    expect(p.sentencing.susp).toContain('s_minor');
  });

  it('두 번 놓아도 한 번', () => {
    const once = apply(s, place(sc, s, 'c_livelihood', 'fav')!);
    const twice = apply(once, place(sc, once, 'c_livelihood', 'fav')!);
    expect(twice.sentencing.special).toEqual(once.sentencing.special);
    expect(twice.sentencing.susp).toEqual(once.sentencing.susp);
    expect(twice.judgment.favorable).toEqual(once.judgment.favorable);
  });

  it('보유하지 않은 카드는 후보에 없고 놓을 수도 없다', () => {
    const lost = { ...s, heldCards: s.heldCards.filter((x) => x !== 'c_nonpunish') };
    expect(panCandidates(sc, lost).map((x) => x.id)).not.toContain('c_nonpunish');
    expect(place(sc, lost, 'c_nonpunish', 'fav')).toBeNull();
  });

  it('후보: 인자 카드는 방향 고정, 형광펜은 side null', () => {
    const c = panCandidates(sc, s);
    expect(c.find((x) => x.id === 'c_nonpunish')?.side).toBe('fav');
    expect(c.find((x) => x.id === 'c_record')?.side).toBe('unfav');
    expect(c.find((x) => x.id === 'hl:0')).toMatchObject({ side: null, src: '형광펜' });
    expect(c.map((x) => x.id)).not.toContain('c_cctv'); // 양형과 무관한 증거 카드는 제외
  });

  it('형광펜은 판결서에만, 반대쪽에 있으면 옮긴다', () => {
    const p = place(sc, s, 'hl:0', 'unfav')!;
    expect(p.sentencing).toEqual({});
    expect(p.judgment.unfavorable).toContain('hl:0');
    const moved = place(sc, apply(s, p), 'hl:0', 'fav')!;
    expect(moved.judgment.favorable).toContain('hl:0');
    expect(moved.judgment.unfavorable).not.toContain('hl:0');
  });

  it('remove는 인자·집유·판결서에서 모두 뺀다', () => {
    const on = apply(s, place(sc, s, 'c_nonpunish', 'fav')!);
    const off = apply(on, remove(sc, on, 'c_nonpunish'));
    expect(off.sentencing.special).not.toContain('f_nonpunish');
    expect(off.sentencing.susp).not.toContain('s_nonpunish');
    expect(off.judgment.favorable).not.toContain('f_nonpunish');
  });
});
