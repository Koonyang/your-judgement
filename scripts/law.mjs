#!/usr/bin/env node
// 국가법령정보 Open API(DRF)로 법령 조문·판례 원문을 받아 텍스트로 출력한다. 고증 장부의 원문 대조용.
// 사용:
//   LAW_OC=<아이디> node scripts/law.mjs law 형사소송법 292의2   # 조문(조 번호 생략 시 법령 전체)
//   LAW_OC=<아이디> node scripts/law.mjs prec 2012다71688        # 판례(판시사항·판결요지·참조조문)
//   ... --full                                                   # 판례 전문까지
// LAW_OC: open.law.go.kr에서 Open API 신청 시 등록한 이메일의 @ 앞부분.
// shortcut: 응답 JSON 필드 구조를 키 없이 검증하지 못해 '내용'·'요지' 계열 키를 깊이 탐색해 뽑는다. 키 받으면 실제 응답으로 확인할 것.
const OC = process.env.LAW_OC;
const [kind, query, jo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const full = process.argv.includes('--full');
if (!OC || !['law', 'prec'].includes(kind) || !query) {
  console.error('사용: LAW_OC=<아이디> node scripts/law.mjs law <법령명> [조번호(예: 292의2)] | prec <사건번호> [--full]');
  process.exit(1);
}
const BASE = 'http://www.law.go.kr/DRF';
async function get(path, params) {
  const u = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries({ OC, type: 'JSON', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u);
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error(`JSON이 아닌 응답(인증키·파라미터 확인): ${t.slice(0, 200)}`); }
}
/** 객체 트리에서 조건에 맞는 값을 문서 순서대로 모은다. */
function collect(node, pick, out = []) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, pick, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && pick(k)) out.push([k, v.trim()]);
    else collect(v, pick, out);
  }
  return out;
}
const findAll = (node, key) => collect(node, (k) => k === key).map(([, v]) => v);
// "292의2" → "029202" (조 4자리 + 가지 2자리)
const joCode = (s) => { const [a, b = '0'] = s.split('의'); return a.padStart(4, '0') + b.padStart(2, '0'); };

if (kind === 'law') {
  const res = await get('lawSearch.do', { target: 'law', query });
  const names = findAll(res, '법령명한글'), ids = findAll(res, '법령일련번호');
  const i = Math.max(0, names.indexOf(query));
  if (!ids[i]) throw new Error(`법령을 찾지 못함: ${query}`);
  const body = await get('lawService.do', { target: 'law', MST: ids[i], ...(jo ? { JO: joCode(jo) } : {}) });
  console.log(`# ${names[i]} ${jo ? `제${jo.replace('의', '조의')}${jo.includes('의') ? '' : '조'}` : ''} (법령일련번호 ${ids[i]})`);
  for (const [, v] of collect(body, (k) => /내용$/.test(k))) console.log(v);
} else {
  const res = await get('lawSearch.do', { target: 'prec', query });
  const nos = findAll(res, '사건번호'), ids = findAll(res, '판례일련번호');
  const i = Math.max(0, nos.indexOf(query));
  if (!ids[i]) throw new Error(`판례를 찾지 못함: ${query}`);
  const body = await get('lawService.do', { target: 'prec', ID: ids[i] });
  const keys = ['사건명', '사건번호', '선고일자', '법원명', '판시사항', '판결요지', '참조조문', '참조판례', ...(full ? ['판례내용'] : [])];
  for (const k of keys) for (const v of findAll(body, k)) console.log(`## ${k}\n${v.replace(/<br\s*\/?>/g, '\n')}\n`);
}
