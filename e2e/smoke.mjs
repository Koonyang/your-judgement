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
  await page.emulateMedia({ reducedMotion: 'reduce' }); // 떠다니는 홀로그램(체스판)은 클릭 대상이 안정되지 않는다
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
  // 판사 닉네임 → 도장 미리보기
  await tid('judge-nickname').fill('홍길동');
  const sealChars = await page.locator('[data-testid="seal-preview"] span').allTextContents();
  if (sealChars.join('') !== '홍길동') throw new Error(`도장 미리보기 글자 이상: ${sealChars.join('')}`);
  await shot('1-docket');
  await tid('btn-open-case').click();
  await shot('2-pretrial');
  const asked = new Set();
  const taken = new Set();
  for (let i = 0; i < 300 && (await text('phase-title')) !== '선고기일 전 재검토'; i++) {
    if (await vis('board-intro')) throw new Error('쟁점 보드를 열기 전에 튜토리얼이 뜸');
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
    // 재판장이 말하는 중에는 마이크(제지)를 누를 수 없다.
    if (await vis('btn-interrupt') && (await text('dialogue-speaker')) === '재판장' && (await tid('btn-interrupt').isEnabled())) throw new Error('재판장 대사 중에 제지 가능');
    // 대사는 화면(법정)을 눌러 넘길 수 있다. 신문 첫 대사에서 한 번 확인.
    if (title.startsWith('증인신문') && !taken.has('tap')) {
      taken.add('tap');
      await page.locator('#game canvas').click({ position: { x: 640, y: 80 } });
      if ((await text('dialogue-text')) === cur) throw new Error('화면을 눌러도 대사가 넘어가지 않음');
      continue;
    }
    // 블록 끝 안내(대사 줄이 아님)도 화면을 눌러 넘길 수 있다.
    if (cur === '모두절차를 마칩니다.') {
      await page.locator('#game canvas').click({ position: { x: 640, y: 80 } });
      if ((await text('phase-title')) === title) throw new Error('모두절차 끝 안내에서 화면을 눌러도 넘어가지 않음');
      continue;
    }
    if (cur.startsWith('솔직히 사장님도')) { await tid('btn-interrupt').click(); continue; }
    if (await vis('btn-highlight-closing') && (await tid('btn-highlight-closing').isEnabled())) await tid('btn-highlight-closing').click();
    await tid('btn-next').click();
  }
  // 재검토: 책상에서 기록을 집어 공판조서를 보고(긴 한글 기록 스크롤) 내려놓는다.
  if ((await tid('tab-docs').getAttribute('aria-pressed')) !== 'true') await tid('tab-docs').click();
  if (!(await vis('panel-docs'))) throw new Error('기록 확대 보기가 열리지 않음');
  await shot('4b-review-transcript');
  await tid('btn-zoom-close').click();
  await tid('panel-docs').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  if (await vis('panel-docs')) throw new Error('내려놓기가 확대 보기를 닫지 않음');
  // 쟁점 보드(길막기 판): 증언 기물 회상(법정 장면 재생) → 대조(키보드)로 턱 찾기
  if ((await text('tab-board')) !== '쟁점 보드') throw new Error('책상 라벨이 쟁점 보드가 아님');
  await tid('tab-board').click();
  if (!(await vis('board-intro'))) throw new Error('쟁점 보드를 처음 열 때 튜토리얼이 안 뜸');
  await tid('btn-board-intro-ok').click();
  await tid('drawer-board-recall-c_owner_testimony').click();
  if (!(await page.evaluate(() => document.documentElement.classList.contains('recall')))) throw new Error('회상이 시작되지 않음');
  if (await vis('drawer')) throw new Error('회상 중에 보드가 가려지지 않음');
  for (let i = 0; i < 20 && (await page.evaluate(() => document.documentElement.classList.contains('recall'))); i++) await tid('btn-next').click();
  if (!(await vis('panel-board-drawer'))) throw new Error('회상 뒤 보드로 돌아오지 않음');
  await tid('drawer-board-rub-r_owner_cctv').click();
  await tid('rub-row-0').focus(); await page.keyboard.press('Enter');
  await tid('rub-row-2').focus(); await page.keyboard.press('Enter');
  if (!(await tid('rub-row-0').getAttribute('class')).includes('snag')) throw new Error('턱이 걸리지 않음');
  if (!(await tid('rub-row-2').getAttribute('class')).includes('smooth')) throw new Error('일치하는 줄이 매끈하지 않음');
  if ((await tid('rub-row-1').getAttribute('class')).includes('snag')) throw new Error('문지르지 않은 줄에 턱이 걸림');
  await shot('4c-rub');
  await tid('btn-rub-close').click();
  if (!(await vis('drawer-board-memo-m_time'))) throw new Error('대조 기록에 어긋남이 남지 않음');
  if (await vis('drawer-board-memo-m_count')) throw new Error('대조하지 않은 줄이 기록됨');
  await tid('btn-zoom-close').click();
  await tid('drawer').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  await tid('btn-next').click();

  // 유무죄: 폰 앞 칸(자백의 보강)에 검사의 증거가 자동으로 올라와 있다. 보강증거(CCTV)를 인정하면 체크메이트
  if (!(await vis('board-judge-corroboration-c_confession-ok'))) throw new Error('검사의 증거가 칸에 자동으로 올라오지 않음');
  if (await tid('btn-confirm-verdict').isEnabled()) throw new Error('판정 전에 확정 가능');
  await tid('board-judge-corroboration-c_cctv-ok').click();
  if (!(await text('board-verdict')).includes('유죄')) throw new Error(`체크메이트 판정 이상: ${await text('board-verdict')}`);
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
  // 저울질 중에는 수치·선고 입력이 없다. 마친 뒤 판결 화면에서 정한다.
  if (await vis('input-months')) throw new Error('저울질 중에 선고형 입력이 보임');
  await shot('6-weigh');
  await tid('btn-scale-done').click();

  // 판결서 작성: 판결서를 누를 때마다 다음 항목이 순서대로 나타나고 오른쪽 도구가 바뀐다.
  if (await vis('tool-order')) throw new Error('누르기 전에 주문 도구가 보임');
  if (await tid('btn-confirm-judgment').isEnabled()) throw new Error('다 쓰기 전에 확정 가능');
  await tid('sec-reasons').click(); // 아래 항목을 눌러도 순서상 첫 항목(주문)이 나온다
  if (!(await vis('tool-order'))) throw new Error('첫 누름에 주문이 나오지 않음');
  // 주문: 스크롤(슬라이더)로 형량, +1개월로 미세 조정
  await tid('input-months').evaluate((el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await tid('btn-months-inc').click();
  if (!(await text('order-line')).includes('징역 6월')) throw new Error(`주문 문장 ${await text('order-line')}`);
  await tid('chk-suspended').check();
  await page.waitForTimeout(300);
  await shot('6-sentencing');
  await tid('sec-facts').click(); // 다음 누름 = 범죄사실, 양형 스크롤은 사라진다
  if (await vis('tool-order') || !(await vis('tool-auto'))) throw new Error('범죄사실로 넘어가며 도구가 바뀌지 않음');
  await tid('sec-evidence').click();
  if (!(await vis('tool-evidence'))) throw new Error('증거의 요지 도구가 나오지 않음');

  // 판결서: CCTV 카드는 끌어다 놓기로. 먼저 밖(제목)에 놓아 변화가 없는지 본 뒤 증거의 요지에 놓는다.
  const cctv = tid('slot-evidence-c_cctv');
  await cctv.dragTo(page.locator('[data-testid="tool-evidence"] h3'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'false') throw new Error('밖에 놓았는데 끼워짐');
  await cctv.dragTo(tid('sec-evidence'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'true') throw new Error('드래그로 끼워지지 않음');
  // 끼운 카드를 끌다 슬롯을 놓쳐도(목록 위에 놓기) 빠지면 안 된다.
  await cctv.dragTo(tid('slot-evidence-c_confession'));
  if ((await cctv.getAttribute('aria-pressed')) !== 'true') throw new Error('끼운 카드가 슬롯 밖에 놓였다고 빠짐');
  for (const id of ['slot-evidence-c_receipt']) {
    if (await vis(id)) await tid(id).click();
  }
  await tid('sec-law').click();
  await tid('sec-reasons').click();
  if (!(await text('judgment-preview')).includes('생계형 범죄')) throw new Error('천칭의 유리한 정상이 판결서에 없음');
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
