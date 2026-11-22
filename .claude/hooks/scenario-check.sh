#!/usr/bin/env bash
# PostToolUse: data/scenarios/*.json을 고치면 형식 검사(loadScenario)와 대사 통계를 돌려 결과를 Claude에게 돌려준다.
f=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
[[ "$f" =~ data/scenarios/[^/]+\.json$ ]] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(npx vitest run tests/scenario/all.test.ts --reporter=dot 2>&1); then
  echo "시나리오 형식 검사 실패 ($f):" >&2; echo "$out" | grep -E "Error|×|FAIL|expected" | head -20 >&2; exit 2
fi
stats=$(node .claude/skills/dialogue-review/scripts/dialogue-stats.mjs "$f" | sed -n '2p;/## 기계 점검/,$p')
node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"시나리오 형식 검사 통과.\n"+process.argv[1]}}))' "$stats"
