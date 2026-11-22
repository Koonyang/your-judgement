#!/usr/bin/env node
// 검수 사이트 반영 준비: 테스트·E2E 실행 → 영수증 숫자 자동 갱신 → 묶음 빌드 → 게시용 파일 맵(publish.json) 작성.
// 사용: node deploy/prepare-review.mjs <출력 폴더>
// 패치 내역(무엇이 바뀌었나)은 사람이 deploy/artifact/index.html에 적는다. 이 스크립트는 날짜·커밋·테스트 수·커밋 건수만 고친다.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('사용: node deploy/prepare-review.mjs <출력 폴더>'); process.exit(1); }
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const LAST = 'deploy/last-publish.json'; // 직전 게시 기록(커밋, 게시한 assets). 다음 게시 때 지울 옛 해시 파일을 고르는 데 쓴다
const last = existsSync(LAST) ? JSON.parse(readFileSync(LAST, 'utf8')) : { commit: null, assets: [] };

// 1) 검증
const vtFile = `${out.replace(/\/$/, '')}-vitest.json`;
try { sh(`npx vitest run --reporter=json --outputFile=${vtFile}`); } catch { /* 실패해도 아래에서 결과 파일로 판정 */ }
const vt = JSON.parse(readFileSync(vtFile, 'utf8'));
if (vt.numFailedTests > 0) { console.error(`단위 테스트 실패 ${vt.numFailedTests}건: 게시 중단`); process.exit(1); }
sh('npm run build');
const e2e = sh('npm run e2e 2>&1 | tail -1');
if (!e2e.includes('E2E PASS')) { console.error(`E2E 실패: ${e2e}`); process.exit(1); }

// 2) 영수증 숫자
const head = sh('git rev-parse --short HEAD');
const count = last.commit ? Number(sh(`git rev-list --count ${last.commit}..HEAD`)) : 0;
const d = new Date();
const date = `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
const R = 'deploy/artifact/index.html';
let html = readFileSync(R, 'utf8');
const rep = (re, s) => { if (!re.test(html)) throw new Error(`영수증에서 ${re} 를 찾지 못함`); html = html.replace(re, s); };
rep(/<p class="r-sub">[^<]*<\/p>/, `<p class="r-sub">${date} 반영 · 커밋 ${head}</p>`);
rep(/(<dt>단위 테스트<\/dt><dd class="ok">)[^<]*(<\/dd>)/, `$1${vt.numPassedTests} / ${vt.numTotalTests} 통과$2`);
rep(/(<span>이번 반영<\/span><span>)커밋 \d+건(<\/span>)/, `$1커밋 ${count}건$2`);
writeFileSync(R, html);

// 3) 묶음 + 게시 맵
sh(`bash deploy/build-artifact.sh ${out}`);
const assets = readdirSync(join(out, 'game/assets')).map((f) => `game/assets/${f}`);
const files = { 'game/index.html': 'game/index.html' };
for (const a of assets) if (!last.assets.includes(a) || !/-[\w-]{8}\./.test(a)) files[a] = a; // 새 해시 파일만 올린다
for (const a of last.assets) if (!assets.includes(a)) files[a] = null; // 옛 해시 파일은 지운다
writeFileSync(join(out, 'publish.json'), JSON.stringify(files, null, 2));
writeFileSync(LAST, JSON.stringify({ commit: head, assets }, null, 2) + '\n');
console.log(JSON.stringify({ out, head, tests: `${vt.numPassedTests}/${vt.numTotalTests}`, commitsSinceLast: count, files }, null, 2));
