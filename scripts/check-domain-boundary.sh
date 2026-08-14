#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# 守住 API ↔ web 嘅邊界（repo-split P1）。
#
# 拆 repo 之後 `apps/api` 根本見唔到 `@authentik/utils`，import 錯即刻 build
# 唔到。但而家仲喺 monorepo，npm workspace 會 hoist，錯咗都照行 —— 所以喺
# 真正拆之前，呢個 check 就係嗰道牆。
#
# 加一個 import 落 API 好易（IDE 自動補全就得），而每加一個，拆 repo 果日就
# 多一件要拆嘅嘢。寧願而家紅，好過嗰日先發現。
# ─────────────────────────────────────────────────────────────────────────
set -eo pipefail
cd "$(dirname "$0")/.."

fail=0

# 唔止 src/ —— prisma/seed.ts 都喺 tsconfig include 入面，一樣會被
# `nest build` 編譯。漏咗佢，本機 hoisting 會遮住，Docker 入面先爆。
hits="$(grep -rn "@authentik/utils\|@authentik/ui" apps/api/src apps/api/prisma 2>/dev/null || true)"
if [ -n "$hits" ]; then
  printf '\033[33m✗\033[0m apps/api 唔可以 import web 嘅 package：\n'
  printf '  %s\n' "$hits"
  printf '  \033[2m業務規則放 @certifine/domain；純前端嘅嘢唔應該喺 API 出現。\033[0m\n'
  fail=1
fi

# domain 唔可以依賴 locale bundle —— 佢一旦拉埋成個 translation data 入去，
# 改一句 copy 就要 domain 發版，正正係拆呢個 package 想避免嘅嘢。
loc="$(grep -rn "from '\./locales'\|@authentik/utils" packages/domain/src 2>/dev/null || true)"
if [ -n "$loc" ]; then
  printf '\033[33m✗\033[0m @certifine/domain 唔可以依賴 locales / utils：\n'
  printf '  %s\n' "$loc"
  printf '  \033[2mdomain = 規則，冇 UI copy。label helper 留喺 packages/utils。\033[0m\n'
  fail=1
fi

[ "$fail" = 0 ] && printf '\033[32m✓\033[0m domain 邊界 OK\n'
exit "$fail"
