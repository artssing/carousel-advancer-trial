#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# 一鍵喺 Jenkins 建 `authentik-pipeline` job + 觸發第一次 build
# —— 完全唔使開瀏覽器撳嘢（用 Jenkins REST API）。
#
# 用法（喺 Mac Terminal，repo 根目錄行）：
#   ./scripts/jenkins-bootstrap.sh                 # 會問你 Jenkins user / password
#   JENKINS_USER=admin JENKINS_TOKEN=xxxx ./scripts/jenkins-bootstrap.sh
#   ENVIRONMENT=prod ./scripts/jenkins-bootstrap.sh   # 建完觸發 prod（會停喺 approve）
#
# 前置：./ci.sh start 已起咗 Jenkins，而且你已行完 setup wizard（建咗 admin user）。
# JENKINS_TOKEN 可以係你登入密碼，或 API token（右上你名→Security→Add new token）。
# ─────────────────────────────────────────────────────────────────────────
# 注意：唔用 `set -u` —— macOS 內置 bash 3.2 對空/非空 array 有舊 bug，
# set -u 會亂報 "unbound variable"。保留 -e / pipefail 就夠。
set -eo pipefail

JENKINS_URL="${JENKINS_URL:-http://localhost:8080}"
JOB="authentik-pipeline"
ENVIRONMENT="${ENVIRONMENT:-uat}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$REPO_DIR/ci/jenkins/job-config.xml"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

[ -f "$CFG" ] || { echo "揾唔到 $CFG"; exit 1; }

# ── 攞 credential ──
JENKINS_USER="${JENKINS_USER:-}"
JENKINS_TOKEN="${JENKINS_TOKEN:-}"
if [ -z "$JENKINS_USER" ]; then read -r -p "Jenkins user: " JENKINS_USER; fi
if [ -z "$JENKINS_TOKEN" ]; then read -r -s -p "Jenkins password / API token: " JENKINS_TOKEN; echo; fi
AUTH=(-u "${JENKINS_USER}:${JENKINS_TOKEN}")

echo "→ 等 Jenkins ($JENKINS_URL) 起身 / 認證…"
ok=0; code=000
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${AUTH[@]}" "$JENKINS_URL/api/json" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then ok=1; break; fi
  echo "  嘗試 $i/45 … HTTP $code（Jenkins 首次開機 + 載 plugin 可能要 1-2 分鐘）"
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo ""
  echo "✗ 連唔到或認證失敗（最後 HTTP=$code）。對照："
  echo "   000 → 連唔到：Jenkins 未起好 / port 唔啱（./ci.sh status 睇下）"
  echo "   401/403 → user 或 password 錯（或者 setup wizard 未建 admin user）"
  echo "   200 → 其實 OK（唔應該去到呢度）"
  exit 1
fi
echo "  ✓ 認證成功（HTTP 200）"

# ── CSRF crumb（Jenkins 官方 xpath 寫法，同一 cookie session）──
# 回傳形如 "Jenkins-Crumb:xxxx"；-c 存 session，之後 POST 用 -b 帶返。
CRUMB=$(curl -fsS "${AUTH[@]}" -c "$COOKIES" \
  "$JENKINS_URL/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,\":\",//crumb)" \
  2>/dev/null || true)
CRUMB_HDR=()
[ -n "$CRUMB" ] && CRUMB_HDR=(-H "$CRUMB")

resp=$(mktemp)

# ── job 存在就唔郁（config 由 image 種入，改 Jenkinsfile 要 rebuild）；冇先 create ──
# 註：Jenkins /job/X/config.xml 嘅 POST 喺 basic-auth 下會被當匿名（known issue），
# 所以唔行 REST 更新；要改 pipeline 就 regenerate job-config.xml + ./ci.sh rebuild。
if curl -fsS "${AUTH[@]}" -b "$COOKIES" "$JENKINS_URL/job/$JOB/api/json" >/dev/null 2>&1; then
  echo "  ✓ job 已存在（config 由 image 種入，跳過）"
else
  echo "→ 建 job [$JOB]…"
  hc=$(curl -s -o "$resp" -w '%{http_code}' "${AUTH[@]}" -c "$COOKIES" -b "$COOKIES" \
    ${CRUMB_HDR[@]+"${CRUMB_HDR[@]}"} \
    -H 'Content-Type: application/xml' --data-binary @"$CFG" \
    "$JENKINS_URL/createItem?name=$JOB")
  if [ "$hc" != "200" ]; then
    echo "✗ 建 job 失敗（HTTP $hc）。Jenkins 回應頭幾行："
    sed -n '1,15p' "$resp" | sed 's/^/    /'; rm -f "$resp"; exit 1
  fi
  echo "  ✓ job 建立完成"
fi

# ── 觸發 build（buildWithParameters 成功會回 201 Created）──
echo "→ 觸發 build（ENVIRONMENT=$ENVIRONMENT）…"
hc=$(curl -s -o "$resp" -w '%{http_code}' "${AUTH[@]}" -c "$COOKIES" -b "$COOKIES" \
  ${CRUMB_HDR[@]+"${CRUMB_HDR[@]}"} -X POST \
  "$JENKINS_URL/job/$JOB/buildWithParameters?ENVIRONMENT=$ENVIRONMENT")
case "$hc" in
  200|201)
    echo "  ✓ 已入隊。睇進度："
    echo "     $JENKINS_URL/job/$JOB/lastBuild/console"
    echo "     (或 http://localhost:8080/job/$JOB/  帳號 admin / admin)"
    ;;
  403)
    echo "✗ 觸發失敗 HTTP 403（CSRF crumb 問題）。回應頭幾行："
    sed -n '1,15p' "$resp" | sed 's/^/    /'; rm -f "$resp"; exit 1
    ;;
  *)
    echo "✗ 觸發失敗 HTTP $hc。回應頭幾行："
    sed -n '1,15p' "$resp" | sed 's/^/    /'; rm -f "$resp"; exit 1
    ;;
esac
rm -f "$resp"
