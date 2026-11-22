---
name: deploy-review
description: Your Judgement 검수 사이트(고정 아티팩트 "Your Judgement")에 현재 브랜치를 반영한다. "검수 사이트 반영", "라이브 반영", "라이브 게임에 반영", "배포", /deploy-review 요청에 쓴다.
---

# 검수 사이트 반영 (deploy-review)

아티팩트: https://claude.ai/artifact/5LGyr1X6pteJBTM8oxQsUe (첫 화면 = 영수증, 게임 = `game/index.html`)

## 순서
1. **패치 내역 쓰기** (사람 말로, 이 단계만 손으로): `deploy/artifact/index.html`의 "패치 내역" 맨 위에 오늘 날짜 `<div class="day">`와 `<ul class="items">`를 추가한다. 필요하면 "검수해 볼 것"·"남은 일"도 고친다. 플레이어가 알아들을 말로, 내부 용어(리듀서, id 등) 없이
2. **준비 스크립트** (테스트·E2E·빌드·영수증 숫자·게시 맵을 한 번에):
   ```bash
   node deploy/prepare-review.mjs <스크래치패드>/site
   ```
   실패하면 멈추고 원인을 보고한다(게시하지 않는다)
3. **게시**: 출력의 `files` 맵을 그대로 Artifact publish에 넘긴다
   - `url`: 위 아티팩트, `file_path`: `<out>/index.html`, `root`: `<out>`, `files`: `<out>/publish.json` 내용, `label`: 짧은 반영 이름
   - 이 세션에서 그 아티팩트를 아직 읽거나 게시하지 않았으면 먼저 `action: "read"`
4. **커밋**: `deploy/artifact/index.html`, `deploy/last-publish.json`을 `deploy: 영수증 <날짜> 반영(<요지>)`으로 커밋·푸시
   - 게시가 실패했으면 `git checkout deploy/last-publish.json`으로 되돌린다(다음 게시 때 지울 파일 계산이 어긋나지 않게)

## 메모
- 스크립트가 고치는 것: 영수증 날짜·커밋 번호, 단위 테스트 수, "이번 반영 커밋 N건"(직전 게시 이후)
- 게시 맵: 바뀐 해시 파일만 올리고, 직전 게시에만 있던 해시 파일은 `null`로 지운다
