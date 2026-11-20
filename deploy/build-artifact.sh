#!/usr/bin/env bash
# 검수 사이트(아티팩트) 묶음 만들기: deploy/build-artifact.sh <출력 폴더>
# 결과: <출력>/index.html(안내·영수증), <출력>/game/index.html, <출력>/game/assets/*. 같은 아티팩트 URL로 게시한다.
set -euo pipefail
out=${1:?출력 폴더}
cd "$(dirname "$0")/.."
npx vite build --base ./ >/dev/null
rm -rf "$out" && mkdir -p "$out/game"
cp deploy/artifact/index.html "$out/index.html"
cp -r dist/assets "$out/game/assets"
css=$(cd dist/assets && ls index-*.css) js=$(cd dist/assets && ls index-*.js)
sed "s/__CSS__/$css/; s/__JS__/$js/" deploy/artifact/game.template.html > "$out/game/index.html"
echo "$out: $css $js"
