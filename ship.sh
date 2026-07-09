#!/usr/bin/env bash
# Sevkiyat hattı: sürüm rozetini artır → build → boot-gate → commit → push.
# Kullanım: bash ship.sh <yeni_sürüm> "commit mesajı"
# KURAL: boot-gate FAIL ise PUSH YOK (canlı son iyi halde kalır).
set -euo pipefail

NEW="${1:?kullanım: bash ship.sh <sürüm> \"mesaj\"}"
MSG="${2:?commit mesajı gerekli}"
BRANCH="claude/counter-strike-game-plan-llpgd8"

echo "▸ package.json sürümü → $NEW"
node -e "const f='package.json',p=require('./'+f);p.version=process.argv[1];require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')" "$NEW"

echo "▸ build"
npm run build

echo "▸ boot-gate"
if ! npm run bootgate; then
  echo "✗ BOOT_FAIL — push iptal. Canlı değişmedi."
  exit 1
fi

echo "▸ commit + push ($BRANCH)"
git add -A
git commit -m "$MSG"
for i in 1 2 3 4; do
  if git push -u origin "$BRANCH"; then break; fi
  echo "push başarısız, $((2**i))s bekle…"; sleep $((2**i))
done
echo "✓ ship v$NEW tamam"
