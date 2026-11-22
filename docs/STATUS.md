# 진행 상황 (다음 세션 인수인계)

> 마지막 갱신: 2026-11-22. 세션 시작 시 이 문서만 읽는다. 결정의 경위·날짜별 기록은 `docs/history.md`

## 지금 상태
- **1화 수직 슬라이스 구현 완료**: 사건 대기열 → 공판 → 판단 → 선고 → 항소 → 판결 기록실. 실행 `npm run dev`, 테스트 `npm test`, E2E `npm run build && npm run e2e`
- **검수 사이트**: 고정 아티팩트 "Your Judgement"(https://claude.ai/artifact/5LGyr1X6pteJBTM8oxQsUe). 반영은 스킬 `/deploy-review`(`deploy/prepare-review.mjs`가 테스트·영수증 숫자·게시 맵 처리)
- **주인공**: 판사로 일하던 중 시력을 잃은 판사. 기록은 점자·화면 낭독(플레이어는 번역된 글자), 시각 증거는 설명으로 듣는다. 1화 반영됨. "집중해서 듣기"는 설계 초안만(`gameplay.md`)
- **스토리**: 0장 + 8화 + 사건 묶음 2개 + 막간 2개, 목표 4~5시간. `docs/story/storyline.md`(v3: 인물·복선 지도·고증 장부 G-1~48·시뮬레이션 S-1~12). 시놉시스 `docs/story/synopsis.md`
- **구현된 장치**: 판사 시점 법정(말하는 사람만 밝음), 대사 줄(화면 터치로 넘김), 재판장 속생각(화자 `thought`, 공판조서 제외), 제지 마이크, 이의 결정, 보충신문, 쟁점 보드, 양형 천칭 → 판결서 작성, 선고 연출, 판사 닉네임 도장(한글·한자 세로 / 영문·숫자 가로, 8자)

## 문서 지도
| 무엇 | 어디 |
|---|---|
| 게임성 설계(확정 사항) | `docs/design/gameplay.md` |
| 1화 설계 | `docs/design/ep01-vertical-slice.md` |
| 화면 틀 설계 | `docs/superpowers/specs/2026-11-20-look-frame-design.md` |
| 고증 노트 | `docs/research/korean-criminal-trial.md` |
| 스토리 고증 장부 | `docs/story/storyline.md` §고증 장부 |
| 대사 검수 | 스킬 `/dialogue-review` |

## 작업 규칙 메모
- 시나리오 테스트는 줄 id로 진행한다(`tests/scenario/play.ts`의 `to('owner_9')`, `toSupp()`, `toPhase('verdict')`). 대사를 추가해도 테스트 숫자를 고칠 필요 없다
- `data/scenarios/*.json`을 고치면 훅이 형식 검사·대사 통계를 자동으로 돈다(`.claude/settings.json`)
- 법령·판례 원문은 `scripts/law.mjs`(국가법령정보 Open API, `LAW_OC` 필요). 클라우드 세션은 나가는 IP가 바뀌어 대부분 막힘(2026-11-22 기준) → PC 세션에서 돌리는 게 확실

## 다음 단계
1. **2화 데이터 전 필수**: `loadScenario`에 블록 간·보충신문 질문 id 중복 검사 추가(`heard`가 id 하나로 줄을 찾음)
2. 0장 프롤로그와 "집중해서 듣기" 구현 설계
3. 고증 원문 대조: `LAW_OC` 받으면 `scripts/law.mjs`로 장부 ❓ 항목부터
4. 결정 대기: 증거목록 ○/× 직접 기입(게임 규칙)
5. 후속 검토
   - 법정 좌석 좌우 배치 `[확인필요]`, 선고 날인 근거 형소법 §41 `[확인필요]`, 절도 법정형·집유 기간 `[todoVerify]`
   - 보강법칙: 전과 수사보고 같은 카드도 보강증거로 인정되는 문제 → 카드에 `corroborates: false` 플래그 검토
   - 불이익변경금지 시 "파기하되 원심 형 상한"이 실무에 가까움(현재는 항소기각 + 지적)
   - 벌금형 선택지, 기록실 중복 저장, 증거목록 성명란 데이터 필드, 피의자신문조서 의견 표기(2화 데이터 때)
   - 출시 전: 대사 전체 사용자 검토, 시각장애 당사자 감수, 최종 도트 그림
