# 때깔 틀 작업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1화를 판사 시점 법정 + 책상 + 양형 천칭 + "스탠드 빛" 팔레트 틀로 바꾸고, 기존 판정 로직과 테스트를 지킨다.

**Architecture:** Phaser는 위 법정 전경(0–150)과 선고 장면만 그린다. 대사 줄(150–200)과 책상(200–360), 확대 서류는 HTML이며 `#ui-root`를 640×360 논리 좌표로 쓰고 `scale(2)`로 키운다. 판정 로직(엔진)은 그대로 두고, 천칭 표시용 순수 함수 하나(`scaleView`)만 추가한다.

**Tech Stack:** TypeScript, Phaser 3.90, Vite 8, Vitest 5, Playwright(e2e 스모크), galmuri 2.40.3

**Spec:** `docs/superpowers/specs/2026-11-20-look-frame-design.md`

## Global Constraints

- 논리 해상도 640×360, 표시 2배(1280×720 고정, 창 맞춤 없음)
- 화면 3단: 법정 y0–150 / 대사 줄 y150–200 / 책상 y200–360 (논리 픽셀)
- 팔레트 토큰은 설계 5.5 표의 값 그대로(`--court #0e0f13` … `--accent #e0b060`), 기존 `--wood*`·`--brass`·`--paper*` 제거
- 폰트 Galmuri11(+Bold)만, 논리 11px. `galmuri@2.40.3` 의존성
- 판사 스프라이트 없음. 검사 왼쪽·변호인/피고인 오른쪽은 임시 `[확인필요]` 주석 유지
- 판정 로직(`src/engine/*` 기존 함수), 데이터 `weight` 변경 금지
- 기존 testid 유지. 바뀌는 건 양형 체크박스 testid(→ 천칭)뿐
- 도장 연출 금지(반목표). 승인/거절 도장 대신 ○/× 기호
- 문서·UI 문구 한국어. "기울어짐"이 아니라 "편향"

## Review Focus

1. 확대 보기를 연 채 단계가 바뀔 때(예: 증거조사 중 증거목록 열림 → 신문 시작) — 단계 진입 규칙대로 닫히거나 바뀌어야 하고 대사 줄 [다음]이 가려지면 안 된다 → Task 4 e2e 스모크가 이 경로를 그대로 지난다
2. 같은 카드를 천칭 두 번 올리기·반대 접시 놓기 → 중복 없이 한 번만, 반대 접시는 튕김 → Task 7 `pans` 단위 테스트
3. 위반으로 카드를 잃은 뒤(정당 대목 제지) 천칭에 그 카드가 남아 있으면 안 된다 → Task 7 `pans` 테스트(보유 안 한 카드는 후보에서 빠짐)
4. 드래그하다 접시·슬롯 밖에 놓기 → 아무 변화 없음, 카드 원위치 → Task 5 e2e 드래그 단계에 밖에 놓기 1회 포함
5. 긴 한글 기록(공판조서) 확대 보기에서 스크롤 → 640×360 안에서 스크롤되고 잘리지 않음 → Task 10 스크린샷 확인 항목

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `index.html`, `src/main.ts`, `src/ui/style.css` | 640×360 스케일, 폰트, 팔레트 토큰, 3단 레이아웃 (Task 1) |
| `src/scenes/seats.ts`, `src/scenes/CourtroomScene.ts`, `src/scenes/BootScene.ts` | 판사 시점 전경, 화자 강조, 초상 텍스처 (Task 2) |
| `src/ui/panels/dialogue.ts` | 대사 줄 + 초상 (Task 3) |
| `src/ui/desk.ts` (신규), `src/ui/overlay.ts` | 책상 물건·확대 보기, 탭 제거 (Task 4) |
| `src/ui/panels/evidence.ts` | B1280 양식 표 (Task 4) |
| `src/ui/drag.ts` (신규), `panels/judgment.ts`, `panels/board.ts` | 끌어다 놓기 + 클릭 선택 (Task 5) |
| `src/engine/scale.ts` (신규), `tests/engine/scale.test.ts` | 천칭 표시 계산 (Task 6) |
| `src/ui/pans.ts` (신규), `tests/ui/pans.test.ts`, `panels/sentencing.ts`, `panels/judgment.ts` | 천칭 화면, 판결서 자동 채움 (Task 7·8) |
| `src/scenes/PronounceScene.ts` | 팔레트·해상도 (Task 9) |
| `e2e/smoke.mjs`, `docs/STATUS.md`, `docs/design/ep01-vertical-slice.md` | 검증·문서 (Task 5·8·10) |

---

### Task 1: 640×360 스케일, 폰트, 팔레트, 3단 뼈대

**Files:**
- Modify: `package.json` (dependency `galmuri@2.40.3`)
- Modify: `index.html` (`#stage` 1280×720 유지, `#ui-root`는 `width:640px;height:360px;transform:scale(2);transform-origin:0 0`)
- Modify: `src/main.ts` (Phaser `width: 640, height: 360, zoom: 2`, 폰트 로드 후 게임 생성)
- Modify: `src/ui/style.css` (토큰 교체, 모든 px 값을 논리 좌표로, `@font-face` Galmuri11/Bold — `galmuri/dist/Galmuri11.woff2` 등 import)
- Modify: `src/scenes/seats.ts` (`FONT_STACK` 첫 항목 `"Galmuri11"`, 나머지 폴백 유지)

**Interfaces:**
- Produces: CSS 클래스 `.band-court`(top 0 h150, 비어 있음·클릭 통과), `.band-dialogue`(top150 h50), `.band-desk`(top200 h160), `.zoom`(확대 보기 컨테이너, 위치는 Task 4). 토큰 이름은 설계 5.5 표 그대로

- [ ] **Step 1:** `npm i galmuri@2.40.3` 후 `npm run typecheck` 통과 확인
- [ ] **Step 2:** index.html/main.ts/style.css 수정. `main.ts`는 `await document.fonts.load('11px Galmuri11')` 뒤 `new Phaser.Game(...)`
- [ ] **Step 3:** 기존 패널 위치 CSS(`.main`, `.drawer`, `.dialogue`, `.stage`, `.topbar`, `.modal`, `.btn.skip`)를 논리 좌표로 절반 환산. 레이아웃 재배치는 Task 3·4에서 하므로 여기선 안 깨질 정도까지만
- [ ] **Step 4:** `npm test && npm run typecheck` PASS, `npm run e2e` PASS(클릭 경로 그대로)
- [ ] **Step 5:** `npm run dev`로 띄워 1280×720 스크린샷 1장(deviceScaleFactor 1)으로 글자가 Galmuri로 나오는지 확인
- [ ] **Step 6:** 커밋 `feat(ui): 640×360 논리 해상도, Galmuri, 스탠드 빛 팔레트 토큰`

### Task 2: 판사 시점 법정 전경

**Files:**
- Modify: `src/scenes/seats.ts` (`SEATS`에서 `judge` 제거하지 말고 `visible:false`로 — `Speaker` 타입에 judge가 있으므로 화자로는 남김. 좌표 640×150 기준 재배치)
- Modify: `src/scenes/BootScene.ts` (플레이스홀더 텍스처 새 팔레트, 이미지 키 = 화자 문자열 규칙 유지)
- Modify: `src/scenes/CourtroomScene.ts`

좌석(논리 좌표, 중심): 방청석 띠 y20–60, 검사 (90,104), 증인 (320,96, 스프라이트 1.5배), 변호인 (520,104), 피고인 (565,106), 참여관 (320,140, 뒤통수: 머리만), 재판장 화면 밖. 바닥 y90부터.

- [ ] **Step 1:** 재판장 스프라이트·이름표를 그리지 않게 하고 좌표 교체. 화자가 `judge`면 강조 없음(대사 줄만)
- [ ] **Step 2:** 강조: 기존 `glow` 사각형 제거. 법정 전체 위 `--court` 50% 어둠 사각형 + 화자 자리만 원형 밝힘(Phaser `Graphics` 원 + `BlendModes.ADD` 또는 어둠 사각형을 화자 위치만 뚫은 마스크 — 둘 중 단순한 것)
- [ ] **Step 3:** 법정 밖 단계(`COURT_PHASES` 아님)면 전경 전체를 `--court`로 덮음(지금 동작 유지)
- [ ] **Step 4:** `npm run typecheck && npm run e2e` PASS
- [ ] **Step 5:** 신문 중 스크린샷 1장 확인(증인이 정면 중앙, 판사 없음)
- [ ] **Step 6:** 커밋 `feat(court): 판사 시점 전경, 화자 강조`

### Task 3: 대사 줄 + 초상

**Files:**
- Modify: `src/ui/panels/dialogue.ts`, `src/ui/style.css`

**Interfaces:**
- Consumes: `.band-dialogue`(Task 1), `SEATS`(색)
- Produces: 대사 줄 DOM `.dialogue`가 y150–200 안에 들어감. testid 전부 유지(`dialogue-speaker`, `dialogue-text`, `btn-next`, `btn-interrupt`, `btn-sustain` …)

- [ ] **Step 1:** 왼쪽 초상 칸 42×42(`testid="dialogue-portrait"`, `data-speaker` 속성, 배경 = 화자 좌석 색, 가운데 이름 첫 글자). 화자 없으면(내레이션) 숨김
- [ ] **Step 2:** 이름표는 `--seal` 배경 + `--hanji` 글자. 대사 11px 두 줄까지 보이고 넘치면 대사 칸만 스크롤. 버튼들은 오른쪽 끝 세로 묶음. 보충신문 질문 목록(`supp-list`)은 대사 줄 위로 펼쳐지는 팝업(y 기준 아래 붙음, 책상 영역 위로 겹쳐도 됨)
- [ ] **Step 3:** `npm run e2e` PASS
- [ ] **Step 4:** 커밋 `feat(ui): 대사 줄과 초상`

### Task 4: 책상 물건과 확대 보기, 증거목록 B1280

**Files:**
- Create: `src/ui/desk.ts`
- Modify: `src/ui/overlay.ts`, `src/ui/panels/evidence.ts`, `src/ui/style.css`

**Interfaces:**
- Produces (`desk.ts`):
  ```ts
  export type DeskItem = { id: string; testid: string; label: string; kind: 'paper' | 'pile' | 'memo' | 'scale'; open: () => void };
  export function createDesk(): { el: HTMLElement; setItems(items: DeskItem[], openId: string | null): void };
  ```
  `kind`는 모양(CSS 클래스)만 정한다. `openId`인 물건은 "집어 든" 표시(책상에서 비움)
- overlay.ts: 기존 `drawer` 상태(`'docs'|'evidence'|'board'|null`)와 단계 진입 규칙(`enter`)을 그대로 쓰고, 탭 버튼 대신 책상 물건으로 연다. 물건 testid = 기존 탭 testid(`tab-docs`, `tab-evidence`, `tab-board`). 단계 주 패널(docket, board main, sentencing, judgment, result, record)은 그 단계에서 자동으로 확대 상태
- 책상 물건 표(설계 5.3)대로. 단계별로 놓일 물건만 `setItems`

- [ ] **Step 1:** `desk.ts` 작성. 물건 = 축소 서류 모양 버튼(종이색 사각형 + 제목 2~4자). 같은 물건 다시 누르면 내려놓기(닫기)
- [ ] **Step 2:** overlay.ts: `topbar`의 탭 제거, `phase-title`은 책상 왼쪽 위 작은 명패로 이동(testid 유지). `drawerEl` → `.zoom` 컨테이너. 확대 보기가 열리면 `#ui-root`에 `zoomed` 클래스: 대사 줄은 맨 아래 y310–360으로 내려가고 `.zoom`은 y0–310(대사 없는 단계면 y0–360). 법정은 그 뒤에서 더 어둡게
- [ ] **Step 3:** 스탠드 빛: `.band-desk::after`에 계단식 `radial-gradient` 4단(`--lamp` 알파 .10/.10/.12/.12, 중심 책상 가운데), `pointer-events:none`. 종이(`.panel`, 책상 물건) 위에는 `mix-blend-mode` 없이 종이를 빛 레이어 위로(z-index) 올려 가독성 유지
- [ ] **Step 4:** evidence.ts를 B1280 표로: 열 = 순번 | 증거명칭 | 성명 | 참조사항 등 | 증거의견(내용) | 증거결정(내용) | 비고. 의견 ○/× = `consent` 값(피의자신문조서면 머리말 "인정/부인", 아니면 "동의/부동의" 주석은 표 아래 1줄로 양식 주석 문구 그대로). 결정 = 해금(`unlockedEvidence`)이면 ○, 부동의·잠김이면 빈칸 + 비고 "원진술자 증인 신청" (데이터에 증인 연결이 없으면 비고 빈칸). 기호는 `--seal`. 기존 잠금 동작(내용 숨김) 유지. 머리글 "증 거 목 록 (증거서류 등)"
- [ ] **Step 5:** `npm run e2e` PASS (탭 testid가 책상 물건으로 옮겨졌으므로 스모크 수정 불필요해야 함. 필요하면 원인 확인 후 최소 수정)
- [ ] **Step 6:** 스크린샷: 공판 전(공소장 확대), 증거조사(증거목록 확대), 신문(책상에 물건 3개) 확인
- [ ] **Step 7:** 커밋 `feat(ui): 책상 물건과 확대 보기, B1280 증거목록`

### Task 5: 끌어다 놓기 (판결서·쟁점 보드)

**Files:**
- Create: `src/ui/drag.ts`
- Modify: `src/ui/panels/judgment.ts`, `src/ui/panels/board.ts`, `src/ui/style.css`, `e2e/smoke.mjs`

**Interfaces:**
- Produces (`drag.ts`):
  ```ts
  export function createDnd(): {
    source(el: HTMLElement, payload: string): void;               // 끌 수 있게 + 클릭하면 선택(다시 클릭하면 해제)
    target(el: HTMLElement, onDrop: (payload: string) => void): void; // 놓으면 onDrop, 선택된 게 있을 때 클릭해도 onDrop
    clear(): void;                                                  // 선택 해제
  };
  ```
  Pointer Events(`pointerdown/move/up` + `setPointerCapture`), 4px 이상 움직여야 드래그. 드래그 중 고스트 = 원소 복제 `position:fixed`. 놓을 곳 판정 `document.elementFromPoint` → 가장 가까운 target. 밖에 놓으면 아무 일 없음. `#ui-root`가 `scale(2)`이므로 고스트 좌표는 화면 좌표 그대로(fixed) 쓰면 된다

- [ ] **Step 1:** drag.ts 작성
- [ ] **Step 2:** judgment.ts: 지금 칩 토글은 **그대로 두고**(testid 유지, e2e 클릭 경로), 판결서 미리보기 문서의 각 슬롯(증거의 요지 / 이탈 사유)을 target으로, 증거 카드 칩을 source로. 놓으면 기존 `toggle(key, id)`와 같은 디스패치(이미 있으면 무시). 슬롯 안 항목을 슬롯 밖으로 끌면 제거. (양형의 이유 유리/불리는 Task 8에서 천칭이 채움)
- [ ] **Step 3:** board.ts(`main`, `drawer` 모드): 카드 목록을 source, 칸을 target. 놓으면 기존 `board-card-*` 클릭과 같은 디스패치
- [ ] **Step 4:** e2e 스모크: 판결서 단계에서 `slot-evidence-c_cctv` 클릭 대신 그 카드를 `locator.dragTo(증거의 요지 슬롯)`로 끼우고, 끼워졌는지(`aria-pressed=true`) 확인. 그 전에 같은 카드를 슬롯 밖(판결서 제목)으로 한 번 끌어 놓아 변화 없음 확인(Review Focus 4). 증거의 요지 슬롯 testid: `drop-evidence`, 이탈 사유: `drop-deviation`
- [ ] **Step 5:** `npm run e2e` PASS
- [ ] **Step 6:** 커밋 `feat(ui): 판결서·쟁점 보드 끌어다 놓기`

### Task 6: 천칭 계산 (엔진, TDD)

**Files:**
- Create: `src/engine/scale.ts`, `tests/engine/scale.test.ts`

**Interfaces:**
- Consumes: `evaluateArea`, `recommendedRange`, `suspensionRecommendation`(`src/engine/sentencing.ts`)
- Produces:
  ```ts
  export type ScaleView = {
    tilt: number;          // 음수 = 유리(감경) 쪽, 양수 = 불리(가중) 쪽. 범위 -3..3
    wobble: boolean;       // judgmentCall
    special: { mitigate: Factor[]; aggravate: Factor[]; area: Area; areaRange: Range };
    adjust: { applied: boolean; range: Range };          // 특별조정 후(없으면 areaRange와 같음)
    general: { mitigate: Factor[]; aggravate: Factor[]; lean: -1 | 0 | 1 };
    susp: { majorPos: number; majorNeg: number; genPos: number; genNeg: number; rec: 'suspend' | 'prison' | 'discretion' };
  };
  export function scaleView(s: Scenario['sentencing'], factors: Factor[], susp: SuspFactor[]): ScaleView;
  ```
  tilt = 영역 성분(mitigated −2 / basic 0 / aggravated +2, 특별조정이면 ∓1 더) + 일반 성분(`lean` × 0.5). `lean` = sign(가중 일반 수 − 감경 일반 수)

- [ ] **Step 1: 실패 테스트** (`tests/engine/scale.test.ts`, ep01 데이터 사용)
  ```ts
  const F = (ids: string[]) => sc.sentencing.factors.filter((f) => ids.includes(f.id));
  const S = (ids: string[]) => sc.sentencing.suspensionFactors.filter((f) => ids.includes(f.id));
  it('빈 천칭: 기본영역 6~18, 수평', () => {
    const v = scaleView(sc.sentencing, [], []);
    expect(v.tilt).toBe(0); expect(v.special.area).toBe('basic'); expect(v.adjust.range).toEqual({ min: 6, max: 18 });
  });
  it('정석(생계형+처벌불원): 감경 특별조정 2~10, tilt -3', () => {
    const v = scaleView(sc.sentencing, F(['f_livelihood', 'f_nonpunish']), []);
    expect(v.special.areaRange).toEqual({ min: 4, max: 10 }); expect(v.adjust).toEqual({ applied: true, range: { min: 2, max: 10 } });
    expect(v.tilt).toBe(-3);
  });
  it('처벌불원 철회(생계형만): 4~10, 조정 없음, tilt -2', () => {
    const v = scaleView(sc.sentencing, F(['f_livelihood']), []);
    expect(v.adjust).toEqual({ applied: false, range: { min: 4, max: 10 } }); expect(v.tilt).toBe(-2);
  });
  it('일반인자만: 범위 그대로, 방향만', () => {
    const v = scaleView(sc.sentencing, F(['f_remorse']), []);
    expect(v.adjust.range).toEqual({ min: 6, max: 18 }); expect(v.general.lean).toBe(-1); expect(v.tilt).toBe(-0.5);
  });
  it('집유 개수와 권고', () => {
    const v = scaleView(sc.sentencing, [], S(['s_livelihood', 's_nonpunish', 's_prior']));
    expect(v.susp).toEqual({ majorPos: 2, majorNeg: 1, genPos: 0, genNeg: 0, rec: 'discretion' });
  });
  ```
- [ ] **Step 2:** `npx vitest run tests/engine/scale.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3:** `scale.ts` 구현(기존 함수 호출만, 새 법리 계산 없음)
- [ ] **Step 4:** PASS, `npm test` 전체 PASS
- [ ] **Step 5:** 커밋 `feat(engine): 천칭 표시용 scaleView`

### Task 7: 접시 규칙 (UI 순수 함수, TDD)

**Files:**
- Create: `src/ui/pans.ts`, `tests/ui/pans.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PanItem = { id: string; label: string; src: '인자' | '카드' | '형광펜'; side: 'fav' | 'unfav' | null }; // side null = 플레이어가 고름
  /** 천칭 후보: 보유 카드 중 양형 인자·집유 사유를 뒷받침하는 카드(인자 방향으로 side 고정) + 형광펜 문장(side null). */
  export function panCandidates(sc: Scenario, s: GameState): PanItem[];
  /** 접시에 놓기. 반대 방향이면 null(튕김). 결과 = 디스패치할 패치 두 개. */
  export function place(sc: Scenario, s: GameState, itemId: string, side: 'fav' | 'unfav'):
    { sentencing: Partial<GameState['sentencing']>; judgment: Partial<GameState['judgment']> } | null;
  export function remove(sc: Scenario, s: GameState, itemId: string):
    { sentencing: Partial<GameState['sentencing']>; judgment: Partial<GameState['judgment']> };
  ```
  규칙: 카드 X를 놓으면 X를 `requiresAnyCard`로 갖는 모든 양형 인자(`special`/`general`에 tier별로)와 집유 사유(`susp`)를 추가. 판결서 `favorable`/`unfavorable`에는 X가 뒷받침하는 **양형 인자 id**(있으면, 첫 번째) 아니면 카드 id. 형광펜은 `hl:<i>`로 판결서에만. 중복 추가 없음. 같은 항목이 반대쪽 판결서 칸에 있으면 뺀다(지금 judgment.ts 규칙)

- [ ] **Step 1: 실패 테스트**
  ```ts
  it('처벌불원 카드는 유리 쪽: 인자+집유 사유+판결서 유리', () => {
    const p = place(sc, s, 'c_nonpunish', 'fav')!;
    expect(p.sentencing.special).toContain('f_nonpunish'); expect(p.sentencing.susp).toContain('s_nonpunish');
    expect(p.judgment.favorable).toContain('f_nonpunish');
  });
  it('반대 접시는 튕김', () => { expect(place(sc, s, 'c_nonpunish', 'unfav')).toBeNull(); });
  it('전과 카드는 불리 고정', () => { expect(place(sc, s, 'c_record', 'fav')).toBeNull(); expect(place(sc, s, 'c_record', 'unfav')!.judgment.unfavorable).toContain('f_prior'); });
  it('피해 경미(집유 사유만)는 카드 id로 판결서에', () => { expect(place(sc, s, 'c_minor', 'fav')!.judgment.favorable).toContain('c_minor'); });
  it('두 번 놓아도 한 번', () => { /* place 결과를 s에 반영 후 다시 place → 배열 길이 동일 */ });
  it('보유하지 않은 카드는 후보에 없다', () => { expect(panCandidates(sc, { ...s, heldCards: s.heldCards.filter((x) => x !== 'c_nonpunish') }).map((x) => x.id)).not.toContain('c_nonpunish'); });
  it('형광펜은 side null, 판결서에만', () => { /* highlights 1개 둔 상태: place('hl:0','unfav') → sentencing 패치 비어 있음, judgment.unfavorable에 'hl:0' */ });
  it('remove는 인자·집유·판결서에서 모두 뺀다', () => { /* place 후 remove → 원래대로 */ });
  ```
  (`s` = `sentencingBasis.test.ts`처럼 `initialState(sc)` + heldCards 전부 + phase 'sentencing')
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** `npm test` PASS
- [ ] **Step 5:** 커밋 `feat(ui): 천칭 접시 규칙`

### Task 8: 양형 천칭 화면, 판결서 자동 채움

**Files:**
- Modify: `src/ui/panels/sentencing.ts`, `src/ui/panels/judgment.ts`, `src/ui/style.css`, `e2e/smoke.mjs`

**Interfaces:**
- Consumes: `scaleView`(Task 6), `panCandidates/place/remove`(Task 7), `createDnd`(Task 5), `recordBasis/selectedBasis/sameBasis`(기존)
- testid: 후보 카드 `pan-item-<id>`(`:`는 `-`로), 접시 `pan-fav`, `pan-unfav`, 접시 안 항목 `pan-on-<id>`, 계산 줄 `calc-special`, `calc-adjust`, `calc-general`, `calc-susp`, 천칭 `scale`(`data-tilt` 속성). 기존 유지: `sentencing-area`, `sentencing-bar`, `susp-recommendation`, `selected-basis`, `input-months`, `chk-suspended`, `sentence-error`, `btn-confirm-sentencing`, `guideline-name`. 사라짐: `factor-*`, `susp-*` 체크박스

- [ ] **Step 1:** sentencing.ts: 체크박스 열 제거 → 왼쪽 후보 카드 목록, 가운데 천칭(빔 `transform: rotate(tilt × 4deg)`, `transition` 400ms, `wobble`이면 ±1deg 반복 애니메이션), 접시 두 개(target), 아래 막대(기록상 권고, 기존 rangebar) + 막대 안 일반인자 방향 화살표(`general.lean`, 범위 안 하한/상한 쪽 음영, 개월 숫자 없이 "하한 쪽으로 · 근거: …") + 계산 줄 4개(설계 5.8 문구 형식). 놓기 = `place` 결과가 null이면 튕김 애니메이션(카드가 원위치로), 아니면 `SET_SENTENCING`·`SET_JUDGMENT` 두 번 디스패치. 접시 안 항목을 밖으로 끌면 `remove`
- [ ] **Step 2:** 계산 줄은 `scaleView(S, selected special+general, selected susp)`(= 접시 기준). 막대·`sentencing-area`는 `recordBasis`. 다르면 `selected-basis`에 "기록상으로는 …" 표시(지금 문구를 기록 기준 표현으로 뒤집기)
- [ ] **Step 3:** judgment.ts: 양형의 이유 유리/불리 행(`reason-rows`)은 남기되 후보 = 지금 판결서 `favorable/unfavorable`에 들어 있는 것 + `reasonCandidates` 나머지. 즉 자동 채움은 Task 7 `place`가 이미 판결서 칸을 채우므로 추가 로직 없음. 기존 `slot-fav-*`/`slot-unfav-*` testid 유지(빼고 더하기용)
- [ ] **Step 4:** e2e 스모크 양형 단계 교체:
  ```js
  // 양형: 생계형·처벌불원 카드를 유리 접시에, 징역 6월 집유
  for (const card of ['c_livelihood', 'c_nonpunish']) { await tid(`pan-item-${card}`).click(); await tid('pan-fav').click(); }
  await tid('pan-item-c_record').click(); await tid('pan-fav').click();          // 튕김
  if (await vis('pan-on-c_record')) throw new Error('반대 접시가 튕기지 않음');
  if ((await tid('scale').getAttribute('data-tilt')) !== '-3') throw new Error('천칭 기울기');
  ```
  판결서 단계의 `slot-fav-f_livelihood`·`slot-fav-f_nonpunish` 클릭은 이미 채워져 있으므로 **제거**(클릭하면 토글로 빠짐)
- [ ] **Step 5:** `npm test && npm run typecheck && npm run e2e` PASS
- [ ] **Step 6:** 스크린샷: 양형 빈 천칭 / 카드 2장 올린 상태 / 판결서(양형 이유 채워짐)
- [ ] **Step 7:** 커밋 `feat(ui): 양형 천칭, 판결서 양형 이유 자동 채움`

### Task 9: 선고 장면

**Files:**
- Modify: `src/scenes/PronounceScene.ts`

- [ ] **Step 1:** 640×360 좌표와 새 팔레트(`--court` 배경, `--hanji` 글자, `--seal` 강조)로. 연출 순서·`BEAT_MS`·건너뛰기 동작 그대로
- [ ] **Step 2:** `npm run e2e` PASS, 선고 중 스크린샷 1장
- [ ] **Step 3:** 커밋 `feat(court): 선고 장면 새 틀`

### Task 10: 전체 확인, 문서

**Files:**
- Modify: `docs/STATUS.md`, `docs/design/ep01-vertical-slice.md`

- [ ] **Step 1:** `npm test && npm run typecheck && npm run e2e` 전부 PASS
- [ ] **Step 2:** 단계별 스크린샷(대기열, 공판 전, 증거조사, 신문, 쟁점 보드, 양형, 판결서, 선고, 기록실) deviceScaleFactor 2로 찍어 사용자에게 보냄. 공판조서 확대 보기 스크롤 확인(Review Focus 5)
- [ ] **Step 3:** STATUS.md: 틀 작업 결정(판사 시점, 640×360, 책상, 스탠드 빛, A안, 양형 천칭, "편향" 개명)과 남은 일(○/× 직접 기입은 게임성 결정 대기, 좌석 좌우 `[확인필요]`, 최종 도트) 기록. ep01-vertical-slice.md: 화면 구성 변경 메모(오버레이 패널 → 책상, 양형 체크 → 천칭)
- [ ] **Step 4:** 커밋 `docs: 틀 작업 반영` 후 push
