#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# CI infra 控制器 — Jenkins + n8n（docker-compose.ci.yml）
#
#   ./ci.sh start      起 Jenkins + n8n（第一次會 build Jenkins image）
#   ./ci.sh stop       停晒（保留 volume / job / workflow）
#   ./ci.sh restart    重起
#   ./ci.sh status     睇 container 狀態
#   ./ci.sh logs [svc] 睇 log（svc = jenkins | n8n，唔填就全部）
#   ./ci.sh password   打印 Jenkins 首次登入密碼
#   ./ci.sh nuke       ⚠️ 連 volume 一齊刪（job 歷史 + n8n workflow 冇晒）
# ─────────────────────────────────────────────────────────────────────────
# 唔用 set -u：macOS 內置 bash 3.2 對 CJK / array 會亂報 "unbound variable"
set -eo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO_DIR
CI_FILE="$REPO_DIR/docker-compose.ci.yml"
COMPOSE=(docker compose -f "$CI_FILE")

banner() {
  cat <<EOF

  ┌─────────────────────────────────────────────┐
  │  Jenkins :  http://localhost:8080           │
  │  n8n     :  http://localhost:5678           │
  └─────────────────────────────────────────────┘
EOF
}

case "${1:-}" in
  start)
    echo "→ 起 Jenkins + n8n…（首次 build Jenkins image 可能要幾分鐘）"
    "${COMPOSE[@]}" up -d --build
    banner
    echo "首次登入 Jenkins 密碼：./ci.sh password"
    echo "接 token / workflow 指引：ci/n8n/README.md"
    ;;
  stop)
    echo "→ 停 Jenkins + n8n（volume 保留）…"
    "${COMPOSE[@]}" down
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    if [ -n "${2:-}" ]; then "${COMPOSE[@]}" logs -f "$2"; else "${COMPOSE[@]}" logs -f; fi
    ;;
  build)
    env_target="${2:-uat}"
    echo "→ 觸發 pipeline（$env_target）… 用自動建立嘅 admin 帳號"
    JENKINS_USER=admin JENKINS_TOKEN=admin ENVIRONMENT="$env_target" \
      "$REPO_DIR/scripts/jenkins-bootstrap.sh"
    ;;
  reseed-jenkins)
    # 只重建 Jenkins（保留 n8n 嘅 workflow）：重 build image + 清 jenkins_home
    # → 重種 job + 重跑 init.groovy（會 apply proxy-compatible crumb）。
    echo "→ 重建 Jenkins（n8n 唔受影響）…"
    "${COMPOSE[@]}" rm -sf jenkins || true
    vol="$(docker volume ls -q | grep -E 'jenkins_home$' | head -1)"
    [ -n "$vol" ] && docker volume rm "$vol" 2>/dev/null && echo "  已清 $vol" || true
    "${COMPOSE[@]}" up -d --build jenkins
    echo "  ✓ Jenkins 重建緊。起身後 crumb 會變 proxy-compatible。"
    echo "  之後 admin/admin 唔變、job 自動重種。"
    ;;
  fresh)
    # 改咗 Jenkinsfile / ci/jenkins 之後用呢個：清 CI 資料 → 重 build image
    # → 重種 job（fresh volume 先 reseed）→ 觸發 build。一鍵完整重來。
    env_target="${2:-uat}"
    echo "→ 完全重來：清 CI 資料 → 重 build → 種 job → 觸發 $env_target …"
    "${COMPOSE[@]}" down -v || true
    "${COMPOSE[@]}" up -d --build
    echo "  等 Jenkins 起身後觸發（script 內有等待 loop）…"
    JENKINS_USER=admin JENKINS_TOKEN=admin ENVIRONMENT="$env_target" \
      "$REPO_DIR/scripts/jenkins-bootstrap.sh"
    ;;
  n8n-import)
    # import n8n workflow。可指定單一檔案：./ci.sh n8n-import deploy-trigger.example.json
    # 唔指定就 import 全部 ci/n8n/*.json
    target="${2:-}"
    if [ -n "$target" ]; then
      set -- "$REPO_DIR/ci/n8n/$target"
      echo "→ import $target 入 n8n…"
    else
      set -- "$REPO_DIR"/ci/n8n/*.json
      echo "→ import ci/n8n/*.json 入 n8n…"
    fi
    found=0
    for f in "$@"; do
      [ -e "$f" ] || continue
      found=1
      name=$(basename "$f")
      docker cp "$f" authentik-n8n:/tmp/"$name" >/dev/null 2>&1 || true
      if docker exec authentik-n8n n8n import:workflow --input=/tmp/"$name" >/dev/null 2>&1; then
        echo "  ✓ $name"
      else
        echo "  ✗ $name（CLI import 唔得，可以喺 n8n 手動 Import from File）"
      fi
    done
    [ "$found" = "1" ] || echo "  冇揾到 ci/n8n/*.json"
    echo ""
    echo "下一步：開 http://localhost:5678 → 開個 workflow → 填你 Telegram token → 撳 Active"
    ;;
  savelog)
    # dump 最後一次 build 嘅 console 去檔案（Claude 可以直接讀，唔使人手 copy）
    mkdir -p "$REPO_DIR/.ci-logs"
    ts=$(date +%Y%m%d-%H%M%S)
    f="$REPO_DIR/.ci-logs/build-$ts.log"
    if curl -fsS -u admin:admin "http://localhost:8080/job/authentik-pipeline/lastBuild/consoleText" -o "$f"; then
      cp "$f" "$REPO_DIR/.ci-logs/latest.log"
      echo "✓ 已存：.ci-logs/latest.log（同 build-$ts.log）"
      echo "  同 Claude 講一聲「fail 咗」，佢就會讀 .ci-logs/latest.log 幫你睇。"
    else
      echo "✗ 攞唔到 log（Jenkins 未起？admin/admin 啱嗎？）"
    fi
    ;;
  rebuild)
    # 改完嘢重新觸發 pipeline（= build，唔使 reseed）
    "$0" build "${2:-uat}"
    ;;
  joblog)
    # dump 最後一次 build 嘅 console（畀 debug）。可加關鍵字：./ci.sh joblog ERROR
    kw="${2:-}"
    URL="http://localhost:8080/job/authentik-pipeline/lastBuild/consoleText"
    if [ -n "$kw" ]; then
      curl -fsS -u admin:admin "$URL" | grep -niC 3 "$kw" || echo "(冇 match '$kw')"
    else
      curl -fsS -u admin:admin "$URL" || echo "攞唔到 log"
    fi
    ;;
  password)
    echo "Jenkins 首次 admin 密碼："
    docker exec authentik-jenkins cat /var/jenkins_home/secrets/initialAdminPassword 2>/dev/null \
      || echo "(攞唔到 —— Jenkins 可能未起好，或者你已經完成初始設定)"
    ;;
  nuke)
    read -r -p "⚠️ 會刪晒 Jenkins job 歷史 + n8n workflow，肯定？(yes/no) " ans
    [ "$ans" = "yes" ] && "${COMPOSE[@]}" down -v && echo "已清空 volume" || echo "取消"
    ;;
  *)
    echo "用法: ./ci.sh {start|stop|restart|status|logs [svc]|build [env]|rebuild [env]|fresh [env]|n8n-import|savelog|joblog [kw]|password|nuke}"
    exit 1
    ;;
esac
