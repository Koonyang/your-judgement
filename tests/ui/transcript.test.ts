// 공판조서는 엔진의 heard만 옮긴다(판사가 듣지 않은 진술은 없다).
import raw from '../../data/scenarios/ep01.json';
import { loadScenario } from '../../src/engine/scenario/load';
import { initialState, type Action } from '../../src/engine/state';
import { transcriptText } from '../../src/ui/panels/docs';
import { play, to, toSupp, type Step } from '../scenario/play';

const sc = loadScenario(raw);
const text = (id: string) => {
  for (const ex of sc.exams) {
    const l = ex.lines.find((x) => x.id === id) ?? ex.supplementary.flatMap((q) => q.answer).find((x) => x.id === id);
    if (l) return l.text;
  }
  throw new Error(id);
};

describe('transcriptText', () => {
  // 점주 신문: 여죄 질문 이의 인용 → 정당 대목 제지 → 모욕 제지 → 보충신문 1개
  const a: Step[] = [
    to('owner_9'), { type: 'RULE_OBJECTION', ruling: 'sustain' }, to('owner_13'),
    { type: 'INTERRUPT' }, { type: 'INTERRUPT' }, toSupp(),
    { type: 'ASK_SUPP', questionId: 'q_owner_items' },
  ];
  const s = play(sc, a);

  it('heard와 줄 수가 같고(머리줄·빈 줄·속생각 제외) 듣지 않은 진술은 없다', () => {
    const t = transcriptText(sc, s);
    const body = t.split('\n').filter((x) => x && !x.startsWith('['));
    const thoughts = s.heard.filter((id) => /^(open_0|open_8a|open_9|owner_8a|owner_18a)$/.test(id));
    expect(thoughts.length).toBeGreaterThan(0);
    expect(body).toHaveLength(s.heard.length - thoughts.length);
    expect(t).not.toContain(text('owner_18a'));
    for (const id of ['owner_10', 'owner_14', 'owner_15']) expect(t).not.toContain(text(id));
    expect(t).toContain('[모두절차]');
    expect(t).toContain('[증인신문 · ');
    expect(t).toContain(`재판장: ${sc.exams[0].supplementary.find((q) => q.id === 'q_owner_items')!.text}`);
  });

  it('아무것도 듣지 않았으면 빈 조서', () => {
    expect(transcriptText(sc, initialState(sc))).toBe('');
  });
});
