#!/usr/bin/env node
// 시나리오 JSON에서 대사(speaker+text)를 문서 순서대로 뽑아 대본과 통계를 낸다.
// 사용: node dialogue-stats.mjs <scenario.json> [--script]   (--script: 대본 전문도 출력)
import { readFileSync } from 'node:fs';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('사용: node dialogue-stats.mjs <scenario.json> [--script]'); process.exit(1); }
const data = JSON.parse(readFileSync(file, 'utf8'));

// 대사 줄 상자: 본문 13px·약 480px 폭·3줄 → 화자 태그 포함 약 100자에서 스크롤이 생김(style.css .dialogue 기준 추정)
const BOX_LIMIT = 90;
const lines = [];
(function walk(node, path) {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    if (typeof node.speaker === 'string' && typeof node.text === 'string') {
      const section = (path.split(/[.[]/)[1] || '?') + (path.includes('.answer') ? '(보충)' : '');
      lines.push({ id: node.id ?? '(id 없음)', speaker: node.speaker, text: node.text, section, path });
    } else if (typeof node.text === 'string' && Array.isArray(node.answer)) {
      // 보충신문 선택지: 재판장 질문(answer 배열의 답변 줄은 아래 재귀에서 수집)
      lines.push({ id: node.id, speaker: 'judge', text: node.text, section: (path.split(/[.[]/)[1] || '?') + '(보충)', path });
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'text') walk(v, `${path}.${k}`);
  }
})(data, '');

const len = s => [...s.replace(/\s/g, '')].length;
const ko = s => (s.match(/[가-힣]/g) || []).length;
const total = lines.reduce((a, l) => a + ko(l.text), 0);

const bySpeaker = {};
for (const l of lines) (bySpeaker[l.speaker] ??= { n: 0, ko: 0 }), bySpeaker[l.speaker].n++, bySpeaker[l.speaker].ko += ko(l.text);
const bySection = {};
for (const l of lines) (bySection[l.section] ??= { n: 0, ko: 0 }), bySection[l.section].n++, bySection[l.section].ko += ko(l.text);

const ids = {}; for (const l of lines) ids[l.id] = (ids[l.id] || 0) + 1;
const dupIds = Object.entries(ids).filter(([, n]) => n > 1).map(([id]) => id);
const tooLong = lines.filter(l => len(l.text) > BOX_LIMIT);
const curt = lines.filter(l => ['witness', 'defendant'].includes(l.speaker) && len(l.text) <= 8);
const banned = lines.filter(l => /이의\s*있(소|습니다)!|잠깐!|거기까지!/.test(l.text));
const bangs = lines.filter(l => (l.text.match(/!/g) || []).length >= 2);

const pct = n => `${Math.round((n / total) * 100)}%`;
console.log(`# ${file}`);
console.log(`대사 ${lines.length}줄, 한글 ${total}자 (분당 300자 기준 읽기 약 ${Math.round(total / 300)}분)`);
console.log('\n## 화자별');
for (const [s, v] of Object.entries(bySpeaker).sort((a, b) => b[1].ko - a[1].ko)) console.log(`- ${s}: ${v.n}줄, ${v.ko}자 (${pct(v.ko)}), 평균 ${Math.round(v.ko / v.n)}자`);
console.log('\n## 구간별');
for (const [s, v] of Object.entries(bySection)) console.log(`- ${s}: ${v.n}줄, ${v.ko}자`);
console.log('\n## 기계 점검');
console.log(`- 대사 상자 초과(공백 제외 ${BOX_LIMIT}자 넘음): ${tooLong.length}줄 ${tooLong.map(l => l.id).join(', ')}`);
console.log(`- 증인·피고인의 단답(8자 이하): ${curt.length}줄 ${curt.map(l => `${l.id}「${l.text}」`).join(' ')}`);
console.log(`- id 중복: ${dupIds.length ? dupIds.join(', ') : '없음'}`);
console.log(`- 역전재판식 외침 의심: ${banned.length ? banned.map(l => l.id).join(', ') : '없음'}`);
console.log(`- 느낌표 2개 이상: ${bangs.length ? bangs.map(l => l.id).join(', ') : '없음'}`);

if (flag === '--script') {
  console.log('\n## 대본');
  let sec = '';
  for (const l of lines) {
    if (l.section !== sec) console.log(`\n### ${(sec = l.section)}`);
    console.log(`[${l.id}] ${l.speaker}: ${l.text}`);
  }
}
