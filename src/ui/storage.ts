// 판결 기록실 저장(localStorage). 저장·읽기 실패는 삼키고 게임 진행에 영향을 주지 않는다.
import type { RecordEntry } from '../engine/record';

const KEY = 'yourJudgement.records.v1';
const RESULTS = new Set(['final', 'dismissed', 'reversed']);

function isEntry(x: unknown): x is RecordEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.caseId === 'string' && typeof e.title === 'string' && typeof e.verdict === 'string'
    && typeof e.sentence === 'string' && typeof e.result === 'string' && RESULTS.has(e.result)
    && Array.isArray(e.remarks) && e.remarks.every((r) => typeof r === 'string')
  );
}

export function loadRecords(): RecordEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** 기존 항목 뒤에 덧붙여 저장한다. 실패하면 false. */
export function saveRecord(e: RecordEntry): boolean {
  try {
    const st = globalThis.localStorage;
    if (!st) return false;
    st.setItem(KEY, JSON.stringify([...loadRecords(), e]));
    return true;
  } catch {
    return false;
  }
}

const NICK_KEY = 'yourJudgement.nickname.v1';

/** 판사 닉네임(도장에 새김). 없거나 읽기 실패면 빈 문자열. */
export function loadNickname(): string {
  try {
    return globalThis.localStorage?.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(name: string): void {
  try {
    globalThis.localStorage?.setItem(NICK_KEY, name);
  } catch {
    // 저장 못 해도 이번 판에서는 입력값을 그대로 쓴다
  }
}
