# CI/CD Runbook — Jenkins + n8n（P1 + P2）點啟動 · 點用

> 前置：先做完 P0（`docs/setup/DOCKER-P0-RUNBOOK.md`，4 個 app image build 到）。
> 全部改動係新增檔案，可 revert（見底）。

## 交付咗嘅檔案

```
ci.sh                          ← 開/熄 CI 嘅唯一入口
docker-compose.ci.yml          ← Jenkins + n8n 兩個容器
ci/jenkins/Dockerfile          ← Jenkins + docker CLI + Node 20
Jenkinsfile                    ← pipeline（type-check→build→image→deploy→smoke）
ci/n8n/README.md               ← n8n 4 個 workflow 逐個點砌
ci/n8n/notify-webhook.example.json  ← 通知 workflow（import 用）
```

---

## 一、啟動（一句）

```bash
./ci.sh start
```

- 第一次會 build Jenkins image（幾分鐘）。
- 起好之後：**Jenkins → http://localhost:8080**、**n8n → http://localhost:5678**。

其他指令：
```bash
./ci.sh status          # 睇狀態
./ci.sh logs jenkins    # 睇 log
./ci.sh stop            # 熄（volume/job/workflow 保留）
./ci.sh password        # 打印 Jenkins 首次登入密碼
```

---

## 二、Jenkins 首次設定（一次過，約 5 分鐘）

1. 開 http://localhost:8080 → 要 unlock：
   ```bash
   ./ci.sh password        # copy 個密碼貼入去
   ```
2. 揀 **Install suggested plugins** → 建立你嘅 admin user。
3. 建 pipeline job：
   - New Item → 名 **`authentik-pipeline`**（⚠️ 要一模一樣，n8n 觸發靠呢個名）→ 揀 **Pipeline** → OK。
   - 落到 **Pipeline** 段 → Definition 揀 **Pipeline script** → 將成個 `Jenkinsfile` 內容 copy 貼入去 → Save。
     （P1 本地版用 paste；P2 先改用 "Pipeline script from SCM" 接 GitHub。）

---

## 三、行第一次 build

1. 入 `authentik-pipeline` → **Build with Parameters**。
2. `ENVIRONMENT = uat` → Build。
3. 睇 stage：Install → **Type-check GATE** → Build → Docker build → Deploy → Smoke test。
4. 綠 = UAT stack 起咗（API 4010 / consumer 3018 / auth 3011 / admin 3013）。

PROD：`ENVIRONMENT = prod` → 會停喺 **"Approve (PROD only)"** 等你入去撳 **Deploy PROD**（呢個就係 approve gate）。

---

## 四、接 n8n（通知 + 自動觸發）

跟 `ci/n8n/README.md`。最快見效嗰兩步：

1. **通知**：n8n import `ci/n8n/notify-webhook.example.json` → 填 Telegram token → Activate。
   然後 Jenkins → Manage Jenkins → System → 加 env var
   `N8N_NOTIFY_URL = http://n8n:5678/webhook/build-status`。
   之後每次 build 完，Jenkins 會 POST 結果去 n8n → 你部電話收到通知。
2. **自動觸發**（push code 就 build）：n8n 砌 Webhook → HTTP Request 打
   `http://jenkins:8080/job/authentik-pipeline/buildWithParameters?ENVIRONMENT=uat`
   （要 Jenkins API token）。GitHub 要打入 localhost → 用 cloudflared tunnel（README 有指令）。

> WhatsApp：n8n 內置 WhatsApp Business Cloud node 換走 Telegram 個 node 即可，
> 但要 WABA + 已審批 template（proposal §4.1）。建議先 Telegram 跑通。

---

## 五、日常點用

| 想做 | 做咩 |
|---|---|
| 開 CI | `./ci.sh start` |
| 部署最新 code 上 UAT | Jenkins → Build with Parameters → `uat`（接咗 webhook 就 push 自動觸發）|
| 上 PROD | Build → `prod` → 收到通知 → 入 Jenkins 撳 Approve |
| 睇邊次 build 掛咗 | Jenkins job 頁 / n8n 通知個 link |
| 熄 CI | `./ci.sh stop` |

---

## 六、你要準備 / 提供嘅嘢（權限 · token）

我寫檔案唔需要你俾我任何權限。以下係**你部機 / 帳戶**要備嘅：

1. **Docker Desktop** 開住（`ci.sh` + pipeline 全靠佢）。Repo 喺 `~/Desktop/...` 預設已喺 Docker file-sharing 範圍。
2. **Jenkins API token**（Jenkins UI 內生成）— 畀 n8n 觸發 build。
3. **Telegram bot token + chat id**（interim 通知）——或 **WhatsApp WABA + template**（最終）。
4. **GitHub webhook + 一條 tunnel**（想 push 自動觸發先需要；純手動 build 唔使）。
5. （P3 上 cloud 先）registry 帳戶、雲 server、真 managed Postgres。

需要我逐個 wire 邊個（例如幫你砌埋 n8n webhook→Jenkins 條 workflow），話我知就得。

---

## 七、Revert

CI 全部係新增檔案，唔影響 app code：
```bash
./ci.sh stop
rm -f ci.sh docker-compose.ci.yml Jenkinsfile
rm -rf ci/
# 想連 Jenkins/n8n 資料一齊清：先 ./ci.sh nuke 再刪檔
```
完整 working-tree 快照：`.backups/worktree-before-cicd-p0-*.tar.gz`

---

## 已知陷阱清單（改 CI script / Jenkinsfile / job-config 前必查 — 唔好 deadloop 同一堆 error）

> 由 CLAUDE.md 搬入嚟（2026-07-14）。每一個都 debug 咗好耐。

1. **macOS 內置 bash 3.2 + `set -u` = 亂報 "unbound variable"**（連 `env_target?` / `JOB?` 呢類詭異名都出）。凡係 CJK 字串 / 空 array 展開就中。**Fix：CI 嘅 bash script 一律唔用 `set -u`**（`ci.sh`、`scripts/jenkins-bootstrap.sh` 都改成 `set -eo pipefail`）。空 array 展開用 `${arr[@]+"${arr[@]}"}`。寫任何新 CI script 都跟。
2. **Jenkins `/job/X/config.xml` POST 喺 basic-auth 下會被當匿名**（回應係 "Oops! A problem occurred" + header 顯示 "Sign in"），所以 **REST 更新 job config 行唔通**。但 `/job/X/buildWithParameters` POST 就 work。**Fix：唔好 REST update config；job config 由 image 種入（`ci/jenkins/job-config.xml` → `ref/jobs/…`），改 pipeline 要 regenerate job-config.xml + `./ci.sh fresh` 重種。**
3. **Jenkinsfile `options{}` 用咗未裝 plugin 嘅 option 會編譯 fail**。撞過：`timestamps()` 要 Timestamper plugin（冇裝）→ `Invalid option type "timestamps"`。**Fix：只用 core option（`disableConcurrentBuilds` / `timeout` / `retry` 等），要額外 option 就先加 plugin 落 `ci/jenkins/plugins.txt` 再 rebuild。** 改完 Jenkinsfile 記得**同步 regenerate `ci/jenkins/job-config.xml`**（入面 inline 咗份 Jenkinsfile）。
4. **`buildWithParameters` 成功回 201（唔係 200）**。curl 檢查要接受 200/201。
5. **Jenkins 全自動化靠 image**：plugin（`plugins.txt`）、admin/admin（`init.groovy.d`）、job（`ref/jobs`）全部喺 image 種。`ref/` 只喺 **JENKINS_HOME 空**（fresh volume）先種 → 改完呢啲一定要 `./ci.sh fresh`（= `down -v` + `up --build` + 重觸發），淨係 restart 唔會 reseed。
6. **助手（Claude）操作限制**：sandbox 連唔到 user 部機嘅 localhost 時，所有 `docker` / `ci.sh` 指令要 user 自己喺 Mac 行，Claude 只可以改 script + 睇 output debug。**唔好假設可以自己 run。**
7. **NEXT_PUBLIC_* 係 build-time inline**：改 API URL 要重 build 前端 image，UAT/PROD 因 port 唔同要各自 build（見 proposal §2）。
8. **type-check 先係權威 gate，唔用 lint**（repo-wide lint 壞咗）；pipeline Stage 3 用 `npm run type-check`。
9. **packages 要 rebuild**（lessons #10 同源）：Docker build stage 用 `turbo run build`（連 `@authentik/utils` 等），唔可以淨係 build app。
10. **Pipeline 唔可以喺 bind-mount 嘅 `/repo` 度 build**：`/repo` 係 user Mac 真實目錄，喺度 `npm ci` 會用 Linux binary 覆蓋佢 Mac 嘅 `node_modules` → 搞爛本地 `npm run dev`。**Fix：Jenkinsfile Stage 1 先 `tar` copy 一份去 `${WORKSPACE}/build`（隔離）再 build，連 gitignored `.env*` 一齊帶過去。** 若已污染，Mac 上 `rm -rf node_modules && npm install` 還原。
11. **Next SWC / turbo binary 跨平台缺失**（npm bug #4828）：lockfile 喺 Mac 整，只列 darwin optional dep，Linux 容器 `npm ci` 揾唔到 `@next/swc-linux-arm64-*` → `Failed to load SWC binary` build fail（turbo 會自我修復，Next 唔會，仲 `ENOWORKSPACES`）。**Fix：需要按平台補 optional dep 嘅地方一律 `npm install`（唔用 `npm ci`）**——pipeline Install stage + 3 個 Next `Dockerfile` 都改咗。alpine=musl variant、debian=gnu variant，`npm install` 自動揀啱。
12. **Workspace 缺 dependency 宣告 → fresh build TS2307**：`@authentik/api-client` `src/types.ts` import `@authentik/utils` 但 package.json 冇宣告 dependency → turbo 唔知要先 build `@authentik/utils` 先 type-check api-client。喺 Mac / bind-mount 因為 `dist/` 預先存在冇爆；隔離 fresh build 就 `Cannot find module '@authentik/utils' (TS2307)`。**Fix：`packages/api-client/package.json` 加 `"dependencies": { "@authentik/utils": "*" }`。每次隔離 build 撞 TS2307「Cannot find module '@authentik/*'」= 去查嗰個 package 有冇漏宣告 workspace dep。**
13. **隔離 build 冇 `prisma generate` → 成堆 `@prisma/client has no exported member`**：api type-check 需要生成咗嘅 Prisma client。隔離 fresh build 冇 → TS2305 + 連鎖 `tx implicitly any (TS7006)` 等下游症狀。**Fix：install 之後、type-check / build 之前一定 `npx prisma generate --schema=apps/api/prisma/schema.prisma`**（`ci/ci-run.sh` install step + api `Dockerfile` 都有）。撞到大量 prisma 型別錯，唔好逐條 fix，係漏咗 generate。
14. **Jenkinsfile 薄殼架構（減少 reseed）**：pipeline 邏輯放 `ci/ci-run.sh`（repo 內，Stage 1 copy 入 BUILD_DIR），Jenkinsfile 只 `sh "bash ci/ci-run.sh <step> <env>"`。改 step 邏輯 = 改 `ci/ci-run.sh` 即生效；**只有改 stage 結構本身（加/減 stage、改 param）先要 `./ci.sh fresh`。**
15. **外部觸發（n8n）撞 Jenkins CSRF crumb**：crumb 綁 web session，跨 request 唔 share cookie → `Forbidden / No valid crumb`。**Fix（本地 dev）：`ci/jenkins/init.groovy.d/02-crumb.groovy` 用 `Jenkins.get().setCrumbIssuer(null)` 關 CSRF crumb** → n8n 單一 POST（admin/admin basic auth）trigger 到。改完 `./ci.sh reseed-jenkins`。**⚠️ 上真雲端 PROD 前要重新開返 crumb + 改用 API token（CSRF-exempt）觸發。** n8n workflow：Form Trigger（uat/prod）→ HTTP POST `http://jenkins:8080/job/authentik-pipeline/buildWithParameters?ENVIRONMENT=...`（Basic Auth credential）。
