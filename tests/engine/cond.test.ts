import { evalCond } from '../../src/engine/cond';

describe('evalCond', () => {
  it('undefined is true', () => expect(evalCond(undefined, new Set())).toBe(true));
  it('all', () => {
    expect(evalCond({ all: ['a'] }, new Set(['a']))).toBe(true);
    expect(evalCond({ all: ['a'] }, new Set())).toBe(false);
  });
  it('none', () => expect(evalCond({ none: ['b'] }, new Set(['b']))).toBe(false));
  it('all+none', () => expect(evalCond({ all: ['a'], none: ['b'] }, new Set(['a', 'b']))).toBe(false));
});
