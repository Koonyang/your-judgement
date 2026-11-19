import mini from '../fixtures/mini.json';
import { loadScenario, ScenarioError } from '../../src/engine/scenario/load';

const clone = () => structuredClone(mini) as any;

function errorsOf(raw: unknown): string[] {
  try {
    loadScenario(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(ScenarioError);
    return (e as ScenarioError).messages;
  }
  throw new Error('expected ScenarioError');
}

describe('loadScenario', () => {
  it('loads mini', () => {
    const s = loadScenario(mini);
    expect(s.meta.id).toBe('mini');
    expect(s.exams[0].lines).toHaveLength(2);
  });
  it('unknown yieldsCards', () => {
    const r = clone();
    r.exams[0].lines[0].yieldsCards = ['nope'];
    expect(errorsOf(r).join('\n')).toContain('nope');
  });
  it('unknown interrupt.resumeAt', () => {
    const r = clone();
    r.exams[0].lines[0].interrupt = { legit: true, resumeAt: 'ghost' };
    expect(errorsOf(r).join('\n')).toContain('ghost');
  });
  it('$end resumeAt is valid', () => {
    const r = clone();
    r.exams[0].lines[0].interrupt = { legit: true, resumeAt: '$end' };
    expect(() => loadScenario(r)).not.toThrow();
  });
  it('resumeAt in other block is invalid', () => {
    const r = clone();
    r.exams[0].lines[0].interrupt = { legit: true, resumeAt: 'o1' };
    expect(errorsOf(r).join('\n')).toContain('o1');
  });
  it('unknown objection resumeAt and violation lostCards', () => {
    const r = clone();
    r.exams[0].lines[0].objection = {
      by: 'defense', correct: 'sustain', onSustain: { resumeAt: 'ghost2' },
      violation: { id: 'v', text: 't', affectsJudgment: false, lostCards: ['lostX'] },
    };
    const m = errorsOf(r).join('\n');
    expect(m).toContain('ghost2');
    expect(m).toContain('lostX');
  });
  it('unknown factor.requiresAnyCard', () => {
    const r = clone();
    r.sentencing.factors[0].requiresAnyCard = ['badcard'];
    expect(errorsOf(r).join('\n')).toContain('badcard');
  });
  it('unknown evidence.cardId', () => {
    const r = clone();
    r.evidence[0].cardId = 'badcard2';
    expect(errorsOf(r).join('\n')).toContain('badcard2');
  });
  it('unknown appealView.cellId', () => {
    const r = clone();
    r.appealView[0].cellId = 'badcell';
    expect(errorsOf(r).join('\n')).toContain('badcell');
  });
  it('unknown unlocksEvidence.evidenceId', () => {
    const r = clone();
    r.exams[0].unlocksEvidence[0].evidenceId = 'badev';
    expect(errorsOf(r).join('\n')).toContain('badev');
  });
  it('schema failure throws ScenarioError', () => {
    const r = clone();
    delete r.meta;
    expect(errorsOf(r).length).toBeGreaterThan(0);
  });
});
