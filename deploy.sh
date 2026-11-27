#!/usr/bin/env bash
# 👑 신회장 비서실 — GitHub Pages 배포 스크립트
# 저장소가 먼저 있어야 합니다 (GitHub 웹에서 빈 public 저장소 생성).
#   사용법: ./deploy.sh            (기본 eunibbb-cyber/secretary-room)
#           OWNER=... REPO=... ./deploy.sh
set -euo pipefail

OWNER="${OWNER:-eunibbb-cyber}"
REPO="${REPO:-secretary-room}"
BRANCH="main"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "▶ 대상: https://github.com/$OWNER/$REPO"

# 1) 저장소 확인 (없으면 안내 후 종료)
if ! gh api "/repos/$OWNER/$REPO" --jq .full_name >/dev/null 2>&1; then
  echo "✗ 저장소를 찾을 수 없습니다: $OWNER/$REPO"
  echo "  1) https://github.com/new 에서 이름 '$REPO', Public, README 없이 생성"
  echo "  2) GitHub → Settings → Applications → Pickle → Configure 에서 이 저장소 접근 허용"
  exit 10
fi

# 2) Pages 활성화 시도 (이미 켜져 있으면 무시)
gh api -X POST "/repos/$OWNER/$REPO/pages" \
  -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 || \
gh api -X PUT "/repos/$OWNER/$REPO/pages" \
  -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 || true

# 3) 커밋 & 푸시
if [ ! -d .git ]; then
  git init -q
  git branch -M "$BRANCH" 2>/dev/null || true
fi
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
  commit -m "👑 신회장 비서실 웹앱" >/dev/null 2>&1 || echo "· 변경 없음(이미 커밋됨)"

git remote remove origin >/dev/null 2>&1 || true
git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin "$BRANCH"

URL="https://$OWNER.github.io/$REPO/"
echo "▶ 배포 반영 대기: $URL"
for i in $(seq 1 20); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || true)"
  echo "  [$i] HTTP $CODE"
  if [ "$CODE" = "200" ]; then
    echo "✓ 배포 완료: $URL"
    exit 0
  fi
  sleep 10
done
echo "△ 푸시는 끝났습니다. Pages 반영에 시간이 더 걸릴 수 있습니다: $URL"
