// 판결 기록실 저장소: localStorage 실패가 게임 진행을 막지 않아야 한다.
// node 환경에서 localStorage를 stub으로 대체한다(jsdom 불필요).
import { loadRecords, saveRecord } from '../../src/ui/storage';
import type { RecordEntry } from '../../src/engine/record';

const entry: RecordEntry = {
  caseId: 'ep01', title: '도시락 두 개', verdict: '유죄', sentence: '징역 6월, 집행유예 1년', result: 'final', remarks: [],
};

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('setItem이 throw하면 saveRecord는 false를 돌려주고 던지지 않는다', () => {
    const throwing = memoryStorage();
    throwing.setItem = () => { throw new Error('QuotaExceededError'); };
    throwing.getItem = () => { throw new Error('SecurityError'); };
    vi.stubGlobal('localStorage', throwing);
    expect(() => saveRecord(entry)).not.toThrow();
    expect(saveRecord(entry)).toBe(false);
    expect(loadRecords()).toEqual([]);
  });

  it('localStorage가 아예 없어도 false / []', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(saveRecord(entry)).toBe(false);
    expect(loadRecords()).toEqual([]);
  });

  it('저장한 항목을 순서대로 불러온다', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadRecords()).toEqual([]);
    expect(saveRecord(entry)).toBe(true);
    expect(saveRecord({ ...entry, result: 'reversed' })).toBe(true);
    expect(loadRecords().map((e) => e.result)).toEqual(['final', 'reversed']);
  });

  it('깨진 저장값은 무시하고 []', () => {
    const st = memoryStorage();
    vi.stubGlobal('localStorage', st);
    st.setItem('yourJudgement.records.v1', '{not json');
    expect(loadRecords()).toEqual([]);
    st.setItem('yourJudgement.records.v1', JSON.stringify([{ caseId: 1 }, entry]));
    expect(loadRecords()).toEqual([entry]);
  });
});

describe('소리 설정', () => {
  it('저장·읽기, 깨진 값은 기본값', async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await import('../../src/ui/storage');
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ sfx: false, voice: true, speed: 'fast' });
    expect(loadSettings()).toEqual({ sfx: false, voice: true, speed: 'fast' });
    localStorage.setItem('yourJudgement.sound.v1', '{"sfx":1,"speed":"x"}');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    vi.unstubAllGlobals();
  });
});
