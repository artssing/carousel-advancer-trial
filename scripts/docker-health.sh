#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Docker / Postgres 健康檢查 + 自動救援 —— start.sh 同 stop.sh 共用。
#
# 開呢個檔係因為 2026-08-12 一次連環冧機，而每一環都係「靜靜地壞」:
#
#   1. 磁碟剩 4.8 GB（99% 滿）
#   2. → Docker VM 個 filesystem 寫壞，containerd metadata I/O error
#   3. → Postgres SIGSEGV 死咗（exit 139），但 `docker ps` 照樣顯示 "Up"
#   4. → API 502 → 前端連 CSS 都攞唔到 → 用戶見到冇 style 嘅 HTML
#   5. → founder 行 ./start.sh 想救，但 `docker info` HANG 住（唔係 fail），
#        個等 daemon 嘅 loop 卡死喺第一圈，一句 output 都冇
#
# 每一步都有得驗，但當時冇一步有得驗。呢度就係補返嗰啲檢查。
#
# 設計原則:**寧願嘈，唔好靜**。壞咗要即刻講，而且要講點救。
# ─────────────────────────────────────────────────────────────────────────

# 顏色（start.sh / stop.sh 可能已經定義咗，冇就用返呢度嘅）
: "${G:=\033[32m}"; : "${B:=\033[34m}"; : "${Y:=\033[33m}"; : "${D:=\033[2m}"; : "${R:=\033[0m}"
_h_say()  { printf "${B}▸${R} %s\n" "$*"; }
_h_ok()   { printf "${G}✓${R} %s\n" "$*"; }
_h_warn() { printf "${Y}!${R} %s\n" "$*"; }
_h_bad()  { printf "${Y}✗${R} %s\n" "$*"; }

# ── 磁碟 ─────────────────────────────────────────────────────────────────
# 2026-08-12 事發時剩 4.8 GB。Docker build 一次過要幾 GB，而個 VM 寫唔落
# 就唔係「build 失敗」咁簡單 —— 係連 containerd 個 metadata DB 都寫壞。
DISK_FLOOR_GB="${DISK_FLOOR_GB:-10}"    # 低過呢個數：唔好行落去
DISK_WARN_GB="${DISK_WARN_GB:-30}"      # 低過呢個數：出聲但照行

disk_free_gb() {
  df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}' \
    || df -g / 2>/dev/null | awk 'NR==2 {print $4}'
}

check_disk() {   # 0 = 夠位（可能有 warn）  1 = 唔夠，唔好行
  local free; free="$(disk_free_gb)"
  [[ -z "$free" ]] && { _h_warn "量唔到磁碟空間 — 跳過檢查"; return 0; }

  if [[ "$free" -lt "$DISK_FLOOR_GB" ]]; then
    _h_bad "磁碟得返 ${free}GB — 低過 ${DISK_FLOOR_GB}GB 安全線，唔好起。"
    printf "  ${D}2026-08-12 就係喺 4.8GB 嗰陣，Docker VM 寫壞、Postgres SIGSEGV、${R}\n"
    printf "  ${D}DB volume 一度連列都列唔到。唔值得為咗慳幾分鐘再賭一次。${R}\n"
    printf "  ${D}清位:~/Downloads、~/Library/Caches，或者 Docker Desktop →${R}\n"
    printf "  ${D}Settings → Resources → Disk image size 做 compact。${R}\n"
    printf "  ${D}真係要照行:DISK_FLOOR_GB=0 ./start.sh …${R}\n"
    return 1
  fi
  if [[ "$free" -lt "$DISK_WARN_GB" ]]; then
    _h_warn "磁碟剩 ${free}GB（建議保持 ${DISK_WARN_GB}GB 以上）"
  fi
  return 0
}

# ── Docker daemon ────────────────────────────────────────────────────────
# `docker info` 唔一定會 fail。Docker Desktop 半死嗰陣（UI 死咗但孤兒
# com.docker.backend 仲霸住個 socket），佢會**永遠 hang**。macOS 冇
# timeout(1)，所以自己 background + 收屍。
docker_ready() {   # docker_ready [秒] → 0=ready 1=唔 ready 2=hang
  local limit="${1:-5}" pid i
  ( docker info >/dev/null 2>&1 ) & pid=$!
  for (( i=0; i<limit*2; i++ )); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid"; return $?; }
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
  return 2
}

# 孤兒 backend 唔殺就點開都開唔返（實測:open -a Docker 完全冇反應）。
docker_recover() {
  _h_warn "Docker daemon hang 咗 — 清咗孤兒 process 再開…"
  osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
  sleep 5
  pkill -9 -f "com.docker.backend" 2>/dev/null || true
  sleep 4
  open -a Docker 2>/dev/null || { _h_bad "開唔到 Docker Desktop — 請手動開"; return 1; }
  local i
  for (( i=0; i<30; i++ )); do
    docker_ready 3 && { _h_ok "Docker daemon 救返"; return 0; }
    sleep 4
  done
  _h_bad "救唔返 —— 請開 Docker Desktop 睇下有冇 dialog 等緊你（可能要 update 或者授權）"
  return 1
}

ensure_docker() {
  command -v docker >/dev/null 2>&1 || {
    _h_bad "Docker 未安裝 — https://docs.docker.com/desktop/install/mac-install/"; return 1; }

  docker_ready 5; local rc=$?
  [[ "$rc" == "0" ]] && return 0
  [[ "$rc" == "2" ]] && { docker_recover || return 1; return 0; }

  _h_say "Docker daemon 未起 — 自動開 Docker Desktop…"
  open -a Docker 2>/dev/null || { _h_bad "open -a Docker 失敗 — 請手動開"; return 1; }
  local i
  for (( i=0; i<45; i++ )); do
    docker_ready 2; rc=$?
    [[ "$rc" == "0" ]] && { _h_ok "Docker daemon ready"; return 0; }
    [[ "$rc" == "2" ]] && { docker_recover || return 1; return 0; }
    sleep 2
  done
  _h_bad "等咗 90 秒 Docker 都未 ready"
  return 1
}

# Docker VM 個 storage 有冇寫壞。`docker volume ls` 列唔到 = metadata 讀唔到，
# 呢個係 DB volume 有危險嘅最早訊號（2026-08-12 就係咁）。
check_docker_storage() {
  local out
  out="$(docker volume ls 2>&1)" || {
    _h_bad "Docker storage 讀唔到（volume 清單失敗）:"
    printf "  ${D}%s${R}\n" "$(echo "$out" | tail -2)"
    printf "  ${D}多數係磁碟爆過寫壞咗。重啟 Docker Desktop 通常修得返;${R}\n"
    printf "  ${D}**唔好** 行 docker system prune --volumes，嗰個會剷埋個 DB。${R}\n"
    return 1
  }
  echo "$out" | grep -q "authentik_pg_data" || _h_warn "搵唔到 authentik_pg_data volume — DB 可能未起過"
  return 0
}

# ── Postgres ─────────────────────────────────────────────────────────────
# `docker ps` 會呃人:2026-08-12 postgres 已經 exit 139（SIGSEGV），但
# `docker ps` 照樣寫住 "Up 26 minutes"，因為 Docker 讀唔到自己個 state 檔。
# 所以真正嘅檢查係問返 Postgres 本身。
PG_CONTAINER="${PG_CONTAINER:-authentik-postgres}"

pg_alive() {   # 0 = 真係識答  1 = 死咗 / 答唔到
  local status
  status="$(docker inspect "$PG_CONTAINER" --format '{{.State.Status}}' 2>/dev/null)" || return 1
  [[ "$status" == "running" ]] || return 1
  docker exec -i "$PG_CONTAINER" pg_isready -U authentik >/dev/null 2>&1
}

ensure_postgres() {
  if pg_alive; then _h_ok "Postgres 健康"; return 0; fi

  local status exitcode
  status="$(docker inspect "$PG_CONTAINER" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
  exitcode="$(docker inspect "$PG_CONTAINER" --format '{{.State.ExitCode}}' 2>/dev/null || echo '?')"
  _h_warn "Postgres 唔健康（status=$status exit=$exitcode）— 重新起…"
  [[ "$exitcode" == "139" ]] && printf "  ${D}exit 139 = SIGSEGV，通常係磁碟爆到寫壞咗個 VM。${R}\n"

  docker compose -f docker-compose.yml up -d --force-recreate postgres >/dev/null 2>&1 || true
  local i
  for (( i=0; i<30; i++ )); do
    sleep 2
    pg_alive && { _h_ok "Postgres 起返身"; return 0; }
  done
  _h_bad "Postgres 起唔返 — docker logs $PG_CONTAINER 睇下"
  return 1
}

# ── 備份 ─────────────────────────────────────────────────────────────────
# 2026-08-12 差啲冇咗七個星期嘅 UAT 資料:個 volume 一度連 `docker volume ls`
# 都列唔到，而最新一份備份係六個星期前。所以 stop 之前一定夾一份。
BACKUP_DIR="${BACKUP_DIR:-.backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"

backup_databases() {   # 盡力而為 —— 失敗唔應該阻止 stop
  pg_alive || { _h_warn "Postgres 唔通 — 跳過備份"; return 0; }
  mkdir -p "$BACKUP_DIR"
  local ts db out
  ts="$(date +%Y%m%d-%H%M%S)"
  for db in authentik authentik_uat; do
    out="$BACKUP_DIR/${db}-auto-${ts}.sql"
    if docker exec -i "$PG_CONTAINER" pg_dump -U authentik "$db" > "$out" 2>/dev/null; then
      _h_ok "備份 $db → $out ($(du -h "$out" | cut -f1))"
    else
      rm -f "$out"
      _h_warn "備份 $db 失敗（個 DB 可能未存在）"
    fi
    # 只保留最近 N 份自動備份。人手嗰啲（唔係 -auto-）唔會掃走。
    ls -t "$BACKUP_DIR/${db}-auto-"*.sql 2>/dev/null | tail -n +$((BACKUP_KEEP+1)) | while read -r old; do
      rm -f "$old"
    done
  done
  return 0
}
