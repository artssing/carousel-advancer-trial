# 發布 `@certifine/domain`（repo-split P2）

> 2026-08-14 · 狀態：**package 準備好，等一個有 `write:packages` 嘅 token**

`@certifine/domain` 係 API 同 web 都要跟嘅 business rule（tier / 平台費 /
訂單狀態機 / 提款上限 / analytics 白名單）。拆 repo 之後佢住喺
`certifine-api`，由嗰邊發版上 **GitHub Packages**，`certifine-web` 食已發布版本。

呢份文件講點發、同埋點解要先發得到版先好拆 repo。

---

## 點解要先試通發版

拆完之後 `certifine-web` **build 唔到**，除非 registry 攞得到
`@certifine/domain`。即係話「發版」呢條路唔通，就唔可以拆。所以次序係：
先喺 monorepo 入面把整條路走一次，再拆。

---

## 一次性設定（founder 要做，唔係 agent 做得到）

發版要一個 **classic Personal Access Token**，scope 要有 `write:packages`
（同 `read:packages`）。而家 `gh auth status` 個 token 得
`admin:public_key, gist, read:org, repo` —— **發唔到**。

1. GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token
2. 剔 `write:packages` + `read:packages`（`repo` 已經有）
3. 放入 shell environment，**唔好 commit 落 repo**：

```bash
export NODE_AUTH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

> `.npmrc` 用 `${NODE_AUTH_TOKEN}` 變數展開，所以檔案本身冇 secret，commit
> 得。真 token 只存在於 environment。呢個係 GitHub 官方做法。

---

## 發一版

```bash
npm run domain:release
```

佢做嘅嘢：`prepack` 重新 build（所以 `dist/` 唔會過期）→ `npm publish`
到 `https://npm.pkg.github.com`。

版本號**手動 bump**（`packages/domain/package.json`）。呢個係故意嘅：
domain 一改就係改 business rule，唔應該由工具自動決定叫咩版本。

- **patch** —— 純內部修正，行為不變
- **minor** —— 加新 export
- **major** —— 改咗現有規則嘅行為（例如 tier 門檻、`needsMyAction` 判斷）

**major 一定要同時喺 `CHANGELOG.md` 寫低改咗咩規則**，因為下游 bump 上去
嗰個人要知佢個 badge / 銀碼會唔會變。

---

## 下游點食

拆 repo 之前（而家）：三個 app 用 npm workspace 解析，`"@certifine/domain": "*"`，
本機改完即刻見到，唔使發版。

拆 repo 之後：`certifine-web` 要 pin 實版本（`"^0.1.0"`），加上一個
repo-root `.npmrc`：

```
@certifine:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

CI 亦都要有 `read:packages` token 先 install 得到。

---

## 驗證發咗乜（唔使真係 publish）

```bash
npm pack --dry-run --workspace=@certifine/domain
```

應該見到 **28 個檔、只有 `dist/` 同 `package.json`**。唔應該見到：

- `src/` —— 只發 `dist`，唔想有人繞過 entry point 直接 import 內部路徑
- `*.tsbuildinfo` —— compiler state，2026-08-14 一度誤入咗 tarball（39kB）

---

## 未做

- CI 未有自動發版 step。而家係人手 `npm run domain:release`。等 P4 CI/CD
  team 接手 `certifine-infra` 嗰陣再接落 pipeline。
- `CANON.md`（proposal §3.5 講嘅共用規矩文件）未寫，未跟 package 一齊發。
