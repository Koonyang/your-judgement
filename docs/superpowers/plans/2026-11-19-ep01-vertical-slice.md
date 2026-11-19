# 1화 수직 슬라이스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1화(편의점 소액 절도)를 공판 전부터 판결 기록실까지 브라우저에서 끝까지 플레이할 수 있게 만든다.

**Architecture:** 판정 로직은 Phaser·DOM에 의존하지 않는 순수 TS 엔진(`src/engine`)이고, 상태는 단일 `GameState`를 리듀서로 갱신한다. 화면은 Phaser 장면(법정 무대·인물·연출)과 그 위에 겹친 HTML 패널(대사창·기록·쟁점 보드·양형·판결서)로 나누고, 컨트롤러가 엔진 상태를 둘에 뿌린다. 시나리오는 `data/scenarios/ep01.json` 하나다.

**Tech Stack:** TypeScript(strict), Vite, Phaser 3, Vitest, zod(시나리오 런타임 검증), 사전 설치된 Playwright(스모크 테스트)

**Spec:** `docs/design/ep01-vertical-slice.md` (규칙 원본: `docs/design/gameplay.md` 평가·태도 변화 섹션)

## Global Constraints
- `src/engine/**`는 `phaser`, `document`, `window`를 import·참조하지 않는다
- 형량 단위는 **개월(정수)**. 데이터·엔진·UI 전부 동일
- 조정 값은 `src/engine/config.ts`에만 둔다: `LEEWAY_RATIO = 0.2`, `PROSECUTOR_APPEAL_RATIO = 0.5`, `DOUBLE_COUNT_FACTOR = 0.5`
- 확률·무작위 없음. 같은 시나리오 + 같은 액션열 → 같은 결과
- UI·데이터 텍스트는 한국어. 코드 식별자는 영어
- 기준 해상도 1280×720, 데스크톱 브라우저
- 원문 미확인 수치·문구는 데이터에 `"todoVerify": true` 표시
- 역전재판식 연출(구두 언쟁, 모순 지적 버튼) 금지

## Review Focus
1. **쟁점 보드가 덜 채워진 채 유무죄 확정** — 미판정 칸이 있으면 확정 불가여야 한다 → Task 3 `canConfirmVerdict` 테스트
2. **이상한 형량 입력**(0, 음수, 소수, 법정형 상한 72개월 초과, 36개월 초과에 집유) — 거부하고 이유를 보여야 한다 → Task 4 `validateSentence` 테스트 (집유 상한 3년: 형법 §62 `[확인필요]`)
3. **버튼 연타·잘못된 시점의 액션**(제지 불가 라인에서 제지, 이의 없는 라인에서 이의 결정) — 상태가 변하지 않아야 한다 → Task 6 리듀서 무시 테스트
4. **localStorage 차단**(사생활 모드) — 기록실 저장 실패해도 게임은 끝까지 진행 → Task 10 테스트
5. **시나리오 데이터 오타**(없는 카드·라인·증거 id 참조) — 로드 시 어느 id가 틀렸는지 오류로 알려야 한다 → Task 2 교차 참조 테스트

---

## 파일 구조
```
package.json, tsconfig.json, vite.config.ts, index.html
data/scenarios/ep01.json            1화 시나리오
src/main.ts                         부트스트랩 (Phaser + 오버레이 + 컨트롤러)
src/engine/config.ts                조정 값
src/engine/scenario/schema.ts       zod 스키마 + 타입 export
src/engine/scenario/load.ts         파싱 + 교차 참조 검증
src/engine/cond.ts                  플래그 조건 평가
src/engine/board.ts                 쟁점 보드
src/engine/sentencing.ts            권고영역·범위·집유·여유폭·형량 검증
src/engine/state.ts                 GameState, Action 타입, 초기 상태
src/engine/reducer.ts               reduce(), 진행·신문·이의·보충신문
src/engine/judgment.ts              판결서 조립
src/engine/appeal.ts                항소 발생·항소심 판정
src/engine/record.ts                기록실 항목
src/game/controller.ts              상태 보관·dispatch·구독
src/scenes/BootScene.ts, CourtroomScene.ts, PronounceScene.ts
src/ui/overlay.ts                   패널 마운트·전환
src/ui/panels/*.ts                  dialogue, docs, evidence, board, sentencing, judgment, result, record, docket
src/ui/storage.ts                   localStorage 래퍼
src/ui/style.css
tests/engine/*.test.ts, tests/scenario/ep01.paths.test.ts
e2e/smoke.mjs
```

---

### Task 1: 프로젝트 골격

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/engine/config.ts`, `tests/engine/config.test.ts`, `.gitignore`

**Interfaces:**
- Produces: npm 스크립트 `dev`, `build`, `preview`, `test`(vitest run), `typecheck`(tsc --noEmit), `e2e`(node e2e/smoke.mjs). `config.ts`의 상수 3개

- [ ] **Step 1:** `npm init -y` 후 `npm i phaser zod` / `npm i -D typescript vite vitest`. tsconfig는 `strict: true`, `resolveJsonModule: true`, `moduleResolution: "bundler"`
- [ ] **Step 2: 실패 테스트** `tests/engine/config.test.ts`
```ts
import { LEEWAY_RATIO, PROSECUTOR_APPEAL_RATIO, DOUBLE_COUNT_FACTOR } from '../../src/engine/config';
test('tunables', () => {
  expect(LEEWAY_RATIO).toBe(0.2);
  expect(PROSECUTOR_APPEAL_RATIO).toBe(0.5);
  expect(DOUBLE_COUNT_FACTOR).toBe(0.5);
});
```
- [ ] **Step 3:** `npm test` → FAIL(모듈 없음)
- [ ] **Step 4:** `config.ts` 작성. `index.html`에 `<div id="game">`(Phaser 캔버스)와 `<div id="ui-root">`(오버레이, 캔버스 위 absolute). `main.ts`는 1280×720 빈 Phaser 게임 생성
- [ ] **Step 5:** `npm test` PASS, `npm run typecheck` PASS, `npm run build` 성공
- [ ] **Step 6:** `.gitignore`에 `node_modules`, `dist` 후 커밋 `chore: Vite+TS+Phaser 골격`

---

### Task 2: 시나리오 스키마·로더·조건 평가

**Files:**
- Create: `src/engine/scenario/schema.ts`, `src/engine/scenario/load.ts`, `src/engine/cond.ts`, `tests/engine/scenario.test.ts`, `tests/engine/cond.test.ts`, `tests/fixtures/mini.json`

**Interfaces:**
- Produces (모두 `schema.ts`에서 zod로 정의하고 `z.infer`로 타입 export):
```ts
type Flag = string;
type Cond = { all?: Flag[]; none?: Flag[] };            // 생략 = 항상 참
type Speaker = 'judge'|'clerk'|'prosecutor'|'defense'|'witness'|'defendant';
type Violation = { id: string; text: string; affectsJudgment: boolean; lostCards: string[] };
type Line = {
  id: string; speaker: Speaker; text: string; when?: Cond;
  sets?: Flag[]; yieldsCards?: string[]; revokesCards?: string[];
  interrupt?: { legit: boolean; resumeAt: string; sets?: Flag[]; violation?: Violation };
  objection?: { by: 'prosecutor'|'defense'; correct: 'sustain'|'overrule';
                onSustain: { resumeAt: string; sets?: Flag[] }; onOverrule?: { sets?: Flag[] };
                violation: Violation };                 // 잘못 결정했을 때 기록
};
type SuppQuestion = { id: string; cellId: string; kind: 'clarify'|'proxy'|'bias'; text: string; answer: Line[]; violation?: Violation };
type Exam = { id: string; kind: 'witness'|'defendant'; name: string; lines: Line[]; supplementary: SuppQuestion[];
              unlocksEvidence?: { evidenceId: string; when?: Cond }[] };
type Evidence = { id: string; label: string; submittedBy: 'prosecutor'|'defense'; consent: boolean; body: string; cardId?: string };
type Card = { id: string; title: string; text: string; kind: 'evidence'|'fact'; confession?: boolean };
type Cell = { id: string; name: string; disputed: boolean };
type AppealView = { cellId: string; proven: boolean; when?: Cond };
type Factor = { id: string; name: string; tier: 'special'|'general'; nature: 'act'|'actor';
                direction: 'mitigate'|'aggravate'; actEquivalent?: boolean; requiresAnyCard: string[]; weight: number };
type SuspFactor = { id: string; name: string; tier: 'major'|'general'; direction: 'positive'|'negative'; requiresAnyCard: string[] };
type Range = { min: number; max: number };            // 개월
type Scenario = {
  meta: { id: string; title: string; court: 'single'|'panel'; biasType: 'none'|'harsh'|'lenient'; truthMemo: string; tutorial: boolean };
  documents: { indictment: string; defenseOpinion: string; facts: string; lawApplied: string };
  opening: Line[]; cells: Cell[]; evidence: Evidence[]; cards: Card[]; exams: Exam[];
  closing: { demandMonths: number; lines: Line[] };       // 구형·최종변론·최후진술 (when으로 분기)
  appealView: AppealView[];
  sentencing: { guidelineName: string; statutoryMaxMonths: number;
                ranges: { mitigated: Range; basic: Range; aggravated: Range };
                factors: Factor[]; suspensionFactors: SuspFactor[]; suspensionDeviation: number };
  appeal: { defendant: { ifImprisoned: boolean; ifConvictedWhileDenying: boolean }; denies: boolean };
};
function loadScenario(raw: unknown): Scenario;   // 실패 시 ScenarioError(messages: string[]) throw
function evalCond(cond: Cond | undefined, flags: ReadonlySet<Flag>): boolean;
```
- [ ] **Step 1: 실패 테스트** `cond.test.ts`: `evalCond(undefined, ∅) === true`, `{all:['a']}`은 `{a}`에서 true·`∅`에서 false, `{none:['b']}`은 `{b}`에서 false, `{all:['a'],none:['b']}`은 `{a,b}`에서 false
- [ ] **Step 2: 실패 테스트** `scenario.test.ts`: `mini.json`(카드 1·라인 2·셀 1짜리 최소 시나리오) 로드 성공 / `yieldsCards: ['nope']` → `ScenarioError`이고 `messages`에 `'nope'` 포함 / `interrupt.resumeAt`이 없는 라인 id → 오류 메시지에 그 id 포함 / `factor.requiresAnyCard`, `evidence.cardId`, `appealView.cellId`, `unlocksEvidence.evidenceId`도 같은 방식 1케이스씩
- [ ] **Step 3:** `npm test` → FAIL
- [ ] **Step 4:** 스키마·`loadScenario`(zod parse 후 교차 참조 검사: 카드·라인(같은 Exam/블록 안)·셀·증거 id)·`evalCond` 구현
- [ ] **Step 5:** `npm test` PASS → 커밋 `feat(engine): 시나리오 스키마와 조건 평가`

---

### Task 3: 쟁점 보드

**Files:**
- Create: `src/engine/board.ts`, `tests/engine/board.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `Card`
- Produces:
```ts
type CellMark = 'proven'|'doubt'|null;
type BoardState = Record<string /*cellId*/, { cards: string[]; mark: CellMark }>;
function initBoard(cells: Cell[]): BoardState;
function canConfirmVerdict(b: BoardState): boolean;               // 모든 칸 mark != null
function verdictOf(b: BoardState): 'guilty'|'acquitted';
type BoardFindings = { factMisfinding: string[] /*증거 0장인 proven 칸*/; corroborationViolation: boolean;
                       appealDisagree: string[] /*doubt로 뒀는데 appealView는 proven*/ };
function boardFindings(b: BoardState, cards: Card[], appealView: AppealView[], flags: ReadonlySet<string>): BoardFindings;
```
- [ ] **Step 1: 실패 테스트**
  - `canConfirmVerdict`: 한 칸 null이면 false
  - `verdictOf`: 전부 proven → guilty, 하나라도 doubt → acquitted
  - 증거 0장 proven 칸 → `factMisfinding`에 그 칸 id
  - 보드 전체에 연결된 카드가 모두 `confession: true` → `corroborationViolation: true`; 자백 + 비자백 1장이 **서로 다른 칸**에 있어도 → false(보드 전체 단위)
  - appealView `{cellId:'intent', proven:true}`인데 플레이어 doubt → `appealDisagree: ['intent']`; `when` 불충족 view는 무시
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat(engine): 쟁점 보드 판정`

---

### Task 4: 양형 계산

**Files:**
- Create: `src/engine/sentencing.ts`, `tests/engine/sentencing.test.ts`

**Interfaces:**
- Consumes: `Factor`, `SuspFactor`, `Range`, `config.ts`
- Produces:
```ts
type Area = 'mitigated'|'basic'|'aggravated';
function availableFactors<T extends {requiresAnyCard: string[]}>(fs: T[], held: ReadonlySet<string>): T[];
function evaluateArea(special: Factor[]): { area: Area; judgmentCall: boolean };
function recommendedRange(s: Scenario['sentencing'], special: Factor[]): { area: Area; range: Range; adjusted: boolean; judgmentCall: boolean };
function suspensionRecommendation(fs: SuspFactor[]): 'suspend'|'prison'|'discretion';
function leeway(range: Range, hasAddendum: boolean): Range;      // min*(1-r) ~ max*(1+r), r = addendum ? LEEWAY_RATIO : 0
function deviationPercent(range: Range, months: number): { dir: 'above'|'below'|null; pct: number };  // 경계 대비 %
type SentenceInput = { months: number; suspended: boolean };
function validateSentence(s: SentenceInput, statutoryMaxMonths: number): string | null;  // 오류 문구 또는 null
```
- 알고리즘(원문: 양형기준 2025. 7. 1.):
  - `evaluateArea`: 행위 순차 = 행위 가중 수 − 행위 감경 수(`actEquivalent`인 행위자 인자는 행위로 셈). 0이 아니면 그 부호로 영역. 0이면 행위자 순차로 영역, 그것도 0이면 basic. 행위 순차와 행위자 순차의 부호가 반대이고 |행위자| > |행위|면 `judgmentCall: true`(원칙 ③ 종합 판단)
  - 특별 조정: 영역이 aggravated이고 (특별가중 수 − 특별감경 수) ≥ 2 → `max = round(max*1.5)`; mitigated 대칭 → `min = floor(min/2)`; `adjusted: true`
  - 집유: d = 주요긍정 − 주요부정, g = 일반긍정 − 일반부정. d ≥ 2 → suspend, d ≤ −2 → prison, 단 (d ≥ 2이고 −g > d) 또는 (d ≤ −2이고 g > −d)면 discretion. 그 외 discretion
  - `validateSentence`: 정수 아님/1 미만 → `'형량은 1개월 이상의 정수여야 합니다'`, 상한 초과 → `'법정형 상한(N개월)을 넘습니다'`, 집유인데 36 초과 → `'집행유예는 3년 이하의 형에만 가능합니다'`
- [ ] **Step 1: 실패 테스트** (ep01 값으로)
  - 일반절도 ranges `{mitigated:{4,10}, basic:{6,18}, aggravated:{10,24}}`
  - 생계형(act, mitigate) + 처벌불원(actor, mitigate, actEquivalent) → `{area:'mitigated', range:{min:2,max:10}, adjusted:true}`
  - 생계형만 → `{area:'mitigated', range:{4,10}, adjusted:false}`
  - 인자 없음 → basic `{6,18}`
  - 행위 감경 1 + 행위자 가중 2 → mitigated, `judgmentCall: true`
  - 집유: 주요긍정 2·주요부정 1 → discretion / 주요긍정 2·부정 0 → suspend / 주요긍정 2·부정 0·일반부정 3·일반긍정 0 → discretion / 주요부정 2 → prison
  - `leeway({4,10}, true)` → `{3.2, 12}`; `leeway({4,10}, false)` → `{4,10}`
  - `deviationPercent({2,10}, 1)` → `{dir:'below', pct:50}`; `({2,10}, 15)` → `{dir:'above', pct:50}`; 범위 안 → `{dir:null, pct:0}`
  - `validateSentence`: `{0,false}`, `{6.5,false}`, `{73,false}`(상한 72), `{40,true}` 각각 오류 문자열; `{6,true}` → null
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat(engine): 양형기준 계산`

---

### Task 5: 게임 상태와 리듀서 (진행·신문·이의·보충신문·태도 변화)

**Files:**
- Create: `src/engine/state.ts`, `src/engine/reducer.ts`, `tests/engine/reducer.test.ts`, `tests/fixtures/exam.json`

**Interfaces:**
- Consumes: Task 2·3·4 전부
- Produces:
```ts
type Phase = 'docket'|'pretrial'|'opening'|'evidence'|'exam'|'closing'|'review'|'verdict'|'sentencing'|'judgment'|'pronounce'|'appeal'|'record';
type GameState = {
  phase: Phase; flags: string[]; heldCards: string[]; filedEvidence: string[]; unlockedEvidence: string[];
  violations: Violation[]; highlights: { docId: string; text: string }[];
  cursor: { block: 'opening'|'closing'|'exam'; examIndex: number; lineId: string | null; inSupp: boolean };
  board: BoardState;
  sentencing: { special: string[]; general: string[]; susp: string[]; months: number | null; suspended: boolean } ;
  judgment: { evidenceSlots: string[]; favorable: string[]; unfavorable: string[]; addendum: string; deviationSlots: string[] };
  outcome: AppealOutcome | null;                         // reviewAppeal 결과 (Task 7이 채움)
};
type Appellants = { prosecutor: boolean; defendant: boolean };
type AppealOutcome = {
  appellants: Appellants;
  result: 'final'|'dismissed'|'reversed';
  reasons: { code: 'law'|'fact'|'procedure'|'sentencing'; text: string }[];   // 파기 사유
  remarks: string[];                                                          // 파기 아닌 지적
  newSentence: { verdict: 'guilty'|'acquitted'; months: number | null; suspended: boolean } | null;
  hypothetical: string[];      // result==='final' && sc.meta.tutorial 일 때 참여관 한 줄용
};
type Action =
  | { type: 'ADVANCE' } | { type: 'INTERRUPT' } | { type: 'RULE_OBJECTION'; ruling: 'sustain'|'overrule' }
  | { type: 'ASK_SUPP'; questionId: string } | { type: 'END_SUPP' }
  | { type: 'HIGHLIGHT'; docId: string; text: string }
  | { type: 'LINK_CARD'; cellId: string; cardId: string } | { type: 'UNLINK_CARD'; cellId: string; cardId: string }
  | { type: 'MARK_CELL'; cellId: string; mark: CellMark } | { type: 'CONFIRM_VERDICT' }
  | { type: 'SET_SENTENCING'; patch: Partial<GameState['sentencing']> } | { type: 'CONFIRM_SENTENCING' }
  | { type: 'SET_JUDGMENT'; patch: Partial<GameState['judgment']> } | { type: 'CONFIRM_JUDGMENT' }
  | { type: 'FINISH_PRONOUNCE' } | { type: 'FINISH_APPEAL' };
function initialState(sc: Scenario): GameState;
function reduce(sc: Scenario, s: GameState, a: Action): GameState;   // 순수 함수, 무효 액션은 s 그대로 반환
function currentLine(sc: Scenario, s: GameState): Line | null;        // when 불충족 라인은 건너뜀
function heldCardSet(s: GameState): ReadonlySet<string>;
```
- 규칙:
  - 단계 순서는 `Phase` 나열 순. `exam`은 `sc.exams` 순서대로 반복(1화: 점주 → 피고인). 각 Exam 라인 끝에 보충신문(`inSupp`)이 열리고 `END_SUPP`로 다음 Exam
  - `evidence` 단계 진입 시 `consent: true` 증거는 `filedEvidence`·`unlockedEvidence`에 넣고 `cardId`를 `heldCards`에 추가. 부동의는 `filedEvidence`만(표목만 보임)
  - `ADVANCE`는 현재 라인을 "들은 것"으로 처리: `sets`·`yieldsCards` 적용, `revokesCards` 제거 후 다음 `when` 충족 라인으로. 이의 라인은 `RULE_OBJECTION` 전까지 `ADVANCE` 무시
  - `INTERRUPT`: 현재 라인에 `interrupt` 없으면 무시. 있으면 그 라인의 효과는 적용하지 않고 `interrupt.sets` 적용, `legit`이면 `violation` 기록, `resumeAt`으로 점프
  - `RULE_OBJECTION`: 결정 플래그 `obj:<lineId>:<ruling>` 추가, `ruling !== correct`면 `violation` 기록, sustain이면 `onSustain.resumeAt`으로
  - `ASK_SUPP`: 질문의 `answer` 라인들을 즉시 적용(카드·플래그), `kind !== 'clarify'`면 `violation` 기록. 같은 질문 두 번 무시
  - Exam 종료 시 `unlocksEvidence` 중 `when` 충족 항목을 `unlockedEvidence`에 추가하고 그 증거 `cardId`를 `heldCards`에
  - `CONFIRM_VERDICT`: `canConfirmVerdict` false면 무시. acquitted면 `judgment`로 바로(양형 건너뜀)
  - `CONFIRM_SENTENCING`: `validateSentence` 오류면 무시
- [ ] **Step 1: 실패 테스트** (`exam.json` 픽스처: 정당 라인 L1(yield `c_rem`), 모욕 라인 L2(interrupt legit:false), L3 `when:{none:['stop_insult']}`가 `revokesCards:['c_np']`, 이의 라인 L4)
  - 끝까지 ADVANCE → `c_rem` 보유, `c_np` 제거
  - L1에서 INTERRUPT → `c_rem` 없음, violation 1건(`affectsJudgment` 값 그대로)
  - L2에서 INTERRUPT(sets `stop_insult`) → L3 건너뜀, `c_np` 유지, violation 없음
  - L4: ADVANCE 무시됨 / 오답 결정 → violation 기록 / 정답 sustain → resumeAt 이동
  - 제지 불가 라인에서 INTERRUPT → 상태 객체 동일(`toBe`)
  - 미판정 칸 있을 때 CONFIRM_VERDICT → phase 그대로
  - 같은 보충신문 두 번 → 두 번째 무시
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat(engine): 상태 리듀서와 태도 변화`

---

### Task 6: 판결서 조립

**Files:**
- Create: `src/engine/judgment.ts`, `tests/engine/judgment.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `GameState`, Task 4
- Produces:
```ts
type JudgmentDoc = { order: string[] /*주문 3박자 문장*/; facts: string; evidenceSummary: string[]; lawApplied: string;
                     sentencingReasons: { favorable: string[]; unfavorable: string[]; addendum: string | null }; acquittalReasons?: string[] };
function assembleJudgment(sc: Scenario, s: GameState): JudgmentDoc;
function formatSentence(months: number): string;   // 6 → '징역 6월', 12 → '징역 1년', 18 → '징역 1년 6월'
```
- 주문: 유죄 `['피고인을 징역 6월에 처한다.', '다만, 이 판결 확정일부터 1년간 위 형의 집행을 유예한다.']` 형식. 집유 기간은 1년 고정(1화) `[todoVerify]`. 무죄 `['피고인은 무죄.']`
- 양형 이유: 카드·형광펜 문장 그대로 나열, `addendum` 빈 문자열이면 null
- [ ] **Step 1: 실패 테스트**: `formatSentence` 3케이스 / 유죄 집유 주문 2문장 / 무죄면 `acquittalReasons`에 doubt 칸 이름과 연결 카드 제목 / addendum '' → null
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat(engine): 판결서 조립`

---

### Task 7: 항소 발생·항소심 판정·기록실 항목

**Files:**
- Create: `src/engine/appeal.ts`, `src/engine/record.ts`, `tests/engine/appeal.test.ts`

**Interfaces:**
- Consumes: Task 3·4·5
- Produces:
```ts
// Appellants, AppealOutcome 타입은 state.ts(Task 5)에 있음
function whoAppeals(sc: Scenario, s: GameState): Appellants;
function reviewAppeal(sc: Scenario, s: GameState): AppealOutcome;
type RecordEntry = { caseId: string; title: string; verdict: string; sentence: string; result: AppealOutcome['result']; remarks: string[] };
function toRecordEntry(sc: Scenario, s: GameState, o: AppealOutcome): RecordEntry;
```
- 규칙 (spec 5.3 그대로):
  - 검사 항소: 무죄 또는 `months < demandMonths × PROSECUTOR_APPEAL_RATIO`. 피고인: `ifImprisoned && !suspended` 또는 `ifConvictedWhileDenying && denies && guilty`
  - 아무도 항소 안 하면 `final`. 이때 tutorial이면 아래 판정을 가상으로 돌려 `hypothetical`에 사유·지적 문구를 담는다
  - 직권: `corroborationViolation` → law 파기, `factMisfinding` → fact 파기, `appealDisagree`(검사 항소 시) → fact 파기·유죄 자판, `affectsJudgment` 위반 → procedure 파기, 나머지 위반 → remarks
  - 양형부당: 항소심 인자 = **잃은 카드(`lostCards`) 복원 후** 보유 카드로 가능한 전체 인자(`availableFactors`). 그 권고범위·여유폭(원심 addendum 기준)을 벗어나고 근거 무게 < 이탈 폭이면 sentencing 파기. 근거 무게 = `deviationSlots` 인자 weight 합, 이탈 방향과 반대 인자 0, 원심 영역 결정에 쓴 특별인자 × `DOUBLE_COUNT_FACTOR`. 집유 판단이 권고(suspend/prison)와 반대면 이탈 폭 = `suspensionDeviation`으로 같은 비교
  - 자판 형량: 파기 시 항소심 범위로 원심 개월 수를 clamp(가장 가까운 경계). 원심이 무죄였으면 범위 하한, 집유는 권고가 prison이 아니면 suspend
  - 불이익변경금지: 검사 미항소·피고인만 항소이고 자판 결과가 원심보다 무거우면(개월 증가, 또는 집유→실형) 원심 유지로 바꾸고 result `dismissed`
  - 파기 사유 없으면 `dismissed`
- [ ] **Step 1: 실패 테스트** (ep01 양형 값, 구형 12개월)
  - 6월 집유, 위반 없음 → 항소 없음, `final`, `hypothetical: []`
  - 5월 집유 → 검사 항소(5 < 6), 범위 2~10 안 → `dismissed`
  - 8월 실형 → 피고인 항소, `dismissed`
  - 1월(범위 2~10, 근거 0) → 검사 항소, `reversed`, sentencing, `newSentence.months === 2`
  - 정당 신문 제지(`affectsJudgment: true`, `lostCards: ['c_nonpunish']`), 6월 집유 → `final`, `hypothetical` 1건 이상
  - 무죄 + appealView proven → `reversed`, fact, `newSentence.verdict === 'guilty'`
  - 피고인만 항소인데 자판 결과가 더 무거움 → `dismissed`, newSentence null
  - 이탈 슬롯: 범위 {4,10}에 15개월(이탈 50%), 슬롯 인자 weight 30+15(방향 일치) → 파기 / 30+15+10 → 유지 / 원심 영역에 쓴 특별인자 weight 30 → 15로 계산
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat(engine): 항소 판정과 기록실 항목`

---

### Task 8: 1화 시나리오 데이터 + 경로 테스트

**Files:**
- Create: `data/scenarios/ep01.json`, `tests/scenario/ep01.paths.test.ts`, `tests/scenario/play.ts`(액션열 실행 헬퍼)

**Interfaces:**
- Consumes: `loadScenario`, `initialState`, `reduce`, `reviewAppeal`
- Produces: `play(sc, actions: Action[]): GameState` 헬퍼, 1화 데이터 (id 규칙: 카드 `c_*`, 라인 `<exam>_<n>`, 플래그 snake_case)
- 데이터 내용은 spec 6절 그대로. 반드시 들어갈 id:
  - 셀: `property`(타인의 재물), `taking`(절취), `intent`(고의), `appropriation`(불법영득의사), 전부 `disputed: false`
  - 카드: `c_confession`(confession), `c_cctv`, `c_receipt`, `c_owner_stmt`, `c_record`(전과), `c_nonpunish`(처벌불원서), `c_livelihood`(생계형: 피고인 의견서·피고인신문), `c_repaid`(변제 사실), `c_remorse`(반성: 최후진술), `c_minor`(피해 경미: 영수증)
  - 인자: 특별감경 `f_livelihood`(act, `c_livelihood`, weight 30) / `f_nonpunish`(actor, actEquivalent, `c_nonpunish`, weight 30) / 일반감경 `f_remorse`(`c_remorse`, 10), `f_recovery`(`c_repaid`, 10) / 일반가중 `f_prior`(`c_record`, 10)
  - 집유: 주요긍정 `s_livelihood`, `s_nonpunish` / 주요부정 `s_prior` / 일반긍정 `s_minor`, `s_remorse`, `s_recovery`
  - 법정형 상한 72개월 `todoVerify`, 구형 12, `suspensionDeviation` 30 `[내 판단]`
  - 점주 Exam: 검사 여죄 질문 라인(objection by defense, correct sustain, violation affectsJudgment false) / 변호인 정당 대목(interrupt legit:true, violation affectsJudgment:true, lostCards `['c_nonpunish']`, 이 대목을 들으면 `c_repaid`) / 모욕 대목(interrupt legit:false, sets `stop_insult`) / 철회 라인(`when: {none:['stop_insult']}`, revokes `c_nonpunish`, sets `nonpunish_withdrawn`) / 보충신문 clarify 2개 / 종료 시 `e_owner_stmt` 해금
  - 피고인 Exam: 검사 추궁(interrupt legit:true, sets `cut_prosecutor`, violation affectsJudgment:false) / 변호인 생활 사정 / 보충 clarify 1개
  - closing: 최후진술 두 버전(`when: {none:['cut_prosecutor']}`이면 진심 + yields `c_remorse`, 아니면 형식적)
  - appealView: 4칸 모두 proven
  - 대사 텍스트는 짧게(라인당 1~2문장). 1화 참여관 안내 라인 포함(모두절차·채부·결과 화면)
- [ ] **Step 1: 실패 테스트** — 경로별 기대값 (모두 끝까지 `play` 후 `reviewAppeal`)
  | 경로 | 액션 요지 | 기대 |
  |---|---|---|
  | 정석 | 이의 sustain, 정당 대목 청취, 모욕 대목 제지, 검사 추궁 청취, 보드 전부 증거 연결·proven, 6월 집유 | 범위 {2,10}, 집유 discretion, `final`, hypothetical 없음 |
  | 정당 대목 제지 | 위에서 정당 대목 INTERRUPT | `c_nonpunish` 없음, 범위 {4,10}, 6월 집유 → `final`, hypothetical 1건 이상 |
  | 모욕 방치 | 모욕 대목 ADVANCE | `nonpunish_withdrawn`, `c_repaid` 있음, 범위 {4,10}, 8월 실형 → 피고인 항소 `dismissed` |
  | 검사 추궁 제지 | 피고인 Exam 추궁 INTERRUPT | `c_remorse` 없음, violation 1건(affectsJudgment false) |
  | 무죄 | `intent` doubt | 검사 항소, `reversed`, fact, 유죄 자판 |
  | 보강법칙 | 모든 칸에 `c_confession`만 연결·proven, 6월 집유 | tutorial hypothetical에 law 사유 |
- [ ] **Step 2:** FAIL(데이터 없음) → **Step 3:** `ep01.json` 작성 → **Step 4:** `npm test` 전체 PASS → **Step 5:** 커밋 `feat(data): 1화 시나리오와 경로 테스트`

---

### Task 9: 화면 뼈대 — 컨트롤러·법정 장면·대사창·진행

**Files:**
- Create: `src/game/controller.ts`, `src/scenes/BootScene.ts`, `src/scenes/CourtroomScene.ts`, `src/ui/overlay.ts`, `src/ui/panels/dialogue.ts`, `src/ui/panels/docket.ts`, `src/ui/panels/docs.ts`, `src/ui/panels/evidence.ts`, `src/ui/style.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: 엔진 전체, `ep01.json`
- Produces:
```ts
class Controller { constructor(sc: Scenario); get state(): GameState; dispatch(a: Action): void; subscribe(fn: (s: GameState) => void): () => void; }
type Panel = { el: HTMLElement; render(s: GameState, sc: Scenario): void };
function mountOverlay(root: HTMLElement, c: Controller, sc: Scenario): void;   // phase에 따라 패널 표시 전환
```
- `CourtroomScene`: 판사석·검사석·변호인석·증인석·피고인석을 색 사각형 플레이스홀더로 그리고, `currentLine().speaker` 자리를 강조. 이미지 키는 `'judge'|'prosecutor'|...` 문자열로 두어 나중에 스프라이트 교체 가능하게
- 대사창(DOM): 화자 이름 + 텍스트, `[다음]`(ADVANCE), 상시 `[제지]`(INTERRUPT, 신문 단계에서만 보임. 라인에 표시를 주지 않음), 이의 라인이면 `[인용]`/`[기각]`, 보충신문이면 질문 버튼 + `[묻지 않음]`
- 사건 대기열(docket) → 공판 전 기록(docs: 공소장·의견서, 문장 선택 후 `[형광펜]` = HIGHLIGHT) → 모두절차 → 증거목록(evidence: 표목, 잠긴 건 자물쇠 + 내용 숨김)
- 모든 버튼에 `data-testid` (`btn-next`, `btn-interrupt`, `btn-sustain`, `btn-overrule`, `btn-supp-<id>`, `btn-supp-end`, …)
- [ ] **Step 1: 실패 테스트** `tests/engine/controller.test.ts`: dispatch 후 subscribe 콜백이 새 상태로 1회 호출, unsubscribe 후 호출 안 됨 (컨트롤러는 DOM 없이 테스트 가능하게 `src/game`에 둠)
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5: 수동 확인** `npm run dev` → 사건 열기부터 피고인신문 보충신문 종료까지 클릭으로 진행되는지, 제지 시 대사가 건너뛰는지 확인
- [ ] **Step 6:** 커밋 `feat(ui): 법정 장면과 진행 화면`

---

### Task 10: 판단 화면 — 쟁점 보드·양형·판결서·선고·결과·기록실

**Files:**
- Create: `src/ui/panels/board.ts`, `src/ui/panels/sentencing.ts`, `src/ui/panels/judgment.ts`, `src/ui/panels/result.ts`, `src/ui/panels/record.ts`, `src/ui/storage.ts`, `src/scenes/PronounceScene.ts`, `tests/ui/storage.test.ts`
- Modify: `src/ui/overlay.ts`

**Interfaces:**
- Consumes: Task 5·6·7·9
- Produces: `saveRecord(e: RecordEntry): boolean`, `loadRecords(): RecordEntry[]` (`storage.ts`, 예외 삼키고 실패 시 false/[])
- 보드: 칸마다 카드 드롭/선택 연결, `[증명됨]/[의심 남음]`, 미판정 칸 있으면 `[판단 확정]` 비활성
- 양형: 유형명·특별/일반 인자 체크박스(보유 카드 없는 인자는 비활성), 권고범위 막대 + 구형 선 + (addendum 작성 시) 여유폭 막대, 집유 참작사유 체크와 권고 표시(집유 권고/실형 권고/종합 판단), 형량 입력 + `validateSentence` 오류 문구 표시
- 판결서: 증거의 요지 슬롯, 유리/불리한 정상 슬롯, `[추가로]` 한 줄 입력. 1화: 여유폭 밖이면 참여관 안내 한 줄만(이탈 슬롯 숨김)
- 선고(`PronounceScene`): 주문 문장을 박자 간격으로 표시 → 도장 "탁"(화면 흔들림 + 도장 사각형) → 법봉 3타(화면 플래시 3회, UI 레이어). 효과음은 키만 두고 무음
- 결과: 항소 여부 → 결과 종류·사유·지적. `final`이고 `hypothetical` 있으면 참여관 한 줄
- 기록실: 이번 사건 항목 + 저장된 항목 목록
- [ ] **Step 1: 실패 테스트** `storage.test.ts`(vitest `environment: 'jsdom'`이 필요하면 `npm i -D jsdom`): `localStorage.setItem`이 throw하도록 stub → `saveRecord` false 반환하고 throw 안 함, `loadRecords` → `[]`
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5: 수동 확인** `npm run dev`로 정석 경로를 기록실까지 진행. 양형 화면에서 72개월 초과·소수 입력 시 오류 문구 확인
- [ ] **Step 6:** 커밋 `feat(ui): 판결·양형·선고·결과 화면`

---

### Task 11: E2E 스모크

**Files:**
- Create: `e2e/smoke.mjs`

**Interfaces:**
- Consumes: Task 9·10의 `data-testid`

- [ ] **Step 1:** `smoke.mjs` 작성: `npm run build` 산출물을 `vite preview --port 4173`으로 띄운 뒤(스크립트 안에서 spawn), 사전 설치된 `playwright`로 chromium 실행(`require('playwright')`, 옵션 없음), 정석 경로를 testid 클릭으로 끝까지 진행, 마지막에 `[data-testid="record-entry"]`가 1개 이상이면 exit 0, 아니면 스크린샷 저장 후 exit 1. 콘솔 error가 있으면 실패
- [ ] **Step 2:** `npm run e2e` → PASS (실패 시 스크린샷 보고 Task 9·10 수정)
- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` 전부 통과 확인
- [ ] **Step 4:** `docs/STATUS.md`에 "1화 수직 슬라이스 구현 완료, 실행: `npm run dev`" 갱신 후 커밋 `test: 1화 E2E 스모크`
