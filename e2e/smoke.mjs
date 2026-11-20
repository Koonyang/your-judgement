// 1화 E2E 스모크: vite preview를 띄우고 정석 경로를 기록실까지 클릭 진행한다.
// 실행: npm run build && npm run e2e
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const SHOT = 'e2e/artifacts/failure.png';

execSync('npm run build', { stdio: 'inherit' });
try { await fetch(BASE); console.error(`E2E FAIL: ${PORT} already in use`); process.exit(1); } catch {}
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(1); });
let serverDied = null;
server.once('exit', (c) => { serverDied = `preview 서버가 종료됨 (code ${c})`; });
server.once('error', (e) => { serverDied = `preview 서버 실행 실패: ${e.message}`; });

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    if (serverDied) throw new Error(serverDied);
    try { if ((await fetch(BASE)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview 서버가 뜨지 않음');
};

let browser, page, code = 1;
const errors = [];
try {
  await waitForServer();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: process.env.SHOTS ? 2 : 1 });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); // GPU stall 등은 warning이라 제외됨
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const vis = async (id) => (await tid(id).count()) > 0 && (await tid(id).first().isVisible());
  // SHOTS=디렉터리 를 주면 단계별 화면을 남긴다(눈 확인용).
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
  const text = async (id) => ((await vis(id)) ? tid(id).innerText() : '');

  // 공판: 이의 인용, 모욕 대목 제지, 보충신문, 최후진술 형광펜
  await page.waitForTimeout(300);
  await shot('1-docket');
  await tid('btn-open-case').click();
  await shot('2-pretrial');
  const asked = new Set();
  const taken = new Set();
  for (let i = 0; i < 300 && (await text('phase-title')) !== '선고기일 전 재검토'; i++) {
    if (await vis('board-intro')) { await tid('btn-board-intro-ok').click(); continue; }
    if (await vis('btn-sustain')) { await tid('btn-sustain').click(); continue; }
    if (await vis('btn-supp-end')) {
      const want = ['btn-supp-q_owner_items', 'btn-supp-q_def_meal'].find((id) => !asked.has(id));
      if (want && (await vis(want)) && (await tid(want).isEnabled())) { asked.add(want); await tid(want).click(); continue; }
      await tid('btn-supp-end').click(); continue;
    }
    const title = await text('phase-title');
    for (const [key, name] of [['증거조사', '3-evidence'], ['증인신문', '4-exam']]) {
      if (title.startsWith(key) && !taken.has(name)) { taken.add(name); await page.waitForTimeout(300); await shot(name); }
    }
    const cur = await text('dialogue-text');
    if (cur.startsWith('솔직히 사장님도')) { await tid('btn-interrupt').click(); continue; }
    if (await vis('btn-highlight-closing') && (await tid('btn-highlight-closing').isEnabled())) await tid('btn-highlight-closing').click();
    await tid('btn-next').click();
  }
  // 재검토: 책상에서 기록을 집어 공판조서를 보고(긴 한글 기록 스크롤) 내려놓는다.
  if ((await tid('tab-docs').getAttribute('aria-pressed')) !== 'true') await tid('tab-docs').click();
  if (!(await vis('panel-docs'))) throw new Error('기록 확대 보기가 열리지 않음');
  await shot('4b-review-transcript');
  await tid('btn-zoom-close').click();
  if (await vis('panel-docs')) throw new Error('내려놓기가 확대 보기를 닫지 않음');
  await tid('btn-next').click();

  // 유무죄: 4칸에 자백 외 증거 연결 + 증명됨
  for (const cell of ['property', 'taking', 'intent', 'appropriation']) {
    for (const card of ['c_cctv', 'c_receipt', 'c_owner_stmt']) {
      if (await vis(`board-card-${cell}-${card}`)) { await tid(`board-card-${cell}-${card}`).click(); break; }
    }
    await tid(`board-mark-${cell}-proven`).click();
  }
  await shot('5-verdict');
  await tid('btn-confirm-verdict').click();

  // 양형: 생계형·처벌불원 카드를 유리 접시에(클릭 경로), 전과 카드는 반대 접시라 튕김. 징역 6월 집유
  for (const card of ['c_livelihood', 'c_nonpunish']) { await tid(`pan-item-${card}`).click(); await tid('pan-fav').click(); }
  await tid('pan-item-c_record').click(); await tid('pan-fav').click();
  if (await vis('pan-on-c_record')) throw new Error('반대 접시가 튕기지 않음');
  if ((await tid('scale').getAttribute('data-tilt')) !== '-3') throw new Error(`천칭 기울기 ${await tid('scale').getAttribute('data-tilt')}`);
  // 접시의 카드는 클릭으로 내리고, 키보드(Enter)로 다시 올릴 수 있어야 한다.
  await tid('pan-on-c_nonpunish').click();
  if (await vis('pan-on-c_nonpunish')) throw new Error('클릭으로 접시에서 내려가지 않음');
  if ((await tid('scale').getAttribute('data-tilt')) !== '-2') throw new Error('내린 뒤 기울기');
  await tid('pan-item-c_nonpunish').focus(); await page.keyboard.press('Enter');
  await tid('pan-fav').focus(); await page.keyboard.press('Enter');
  if ((await tid('scale').getAttribute('data-tilt')) !== '-3') throw new Error('키보드로 다시 올라가지 않음');
  await tid('input-months').fill('6');
  await tid('chk-suspended').check();
  await page.waitForTimeout(500);
  await shot('6-sentencing');
  await tid('btn-confirm-sentencing').click();

  // 판결서: CCTV 카드는 끌어다 놓기로. 먼저 밖(제목)에 놓아 변화가 없는지 본 뒤 증거의 요지에 놓는다.
  const cctv = tid('slot-evidence-c_cctv');
  await cctv.dragTo(page.locator('[data-testid="panel-judgment"] h2'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'false') throw new Error('밖에 놓았는데 끼워짐');
  await cctv.dragTo(tid('drop-evidence'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'true') throw new Error('드래그로 끼워지지 않음');
  // 끼운 카드를 끌다 슬롯을 놓쳐도(목록 위에 놓기) 빠지면 안 된다.
  await cctv.dragTo(tid('slot-evidence-c_confession'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'true') throw new Error('끼운 카드가 슬롯 밖에 놓였다고 빠짐');
  for (const id of ['slot-evidence-c_receipt', 'slot-unfav-c_record']) {
    if (await vis(id)) await tid(id).click();
  }
  await shot('7-judgment');
  await tid('btn-confirm-judgment').click();

  // 선고 → 항소 결과 → 기록실
  if (process.env.SHOTS) { await page.waitForTimeout(2900); await shot('8-pronounce'); }
  await tid('btn-skip-pronounce').click();
  await tid('panel-result').waitFor({ state: 'visible' });
  await tid('btn-finish-appeal').click();
  await tid('record-entry').first().waitFor({ state: 'visible' });

  await shot('9-record');
  const n = await tid('record-entry').count();
  if (n < 1) throw new Error('record-entry 없음');
  if (errors.length) throw new Error(`콘솔 오류:\n${errors.join('\n')}`);
  console.log(`E2E PASS (record-entry=${n})`);
  code = 0;
} catch (e) {
  console.error('E2E FAIL:', e.message);
  if (errors.length) console.error(`콘솔 오류:\n${errors.join('\n')}`);
  if (page) { mkdirSync('e2e/artifacts', { recursive: true }); await page.screenshot({ path: SHOT }).catch(() => {}); console.error(`스크린샷: ${SHOT}`); }
} finally {
  await browser?.close().catch(() => {});
  stop();
}
process.exit(code);
