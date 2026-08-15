# 發布 `@certifine/domain`（repo-split P2）

> 2026-08-14 開 · **2026-08-15 第一版 `@certifine/domain@0.1.0` 已發布**

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

## 唔需要 Personal Access Token

初稿寫住要開一個有 `write:packages` 嘅 classic PAT。**唔使。** 發版行
`.github/workflows/publish-domain.yml`，用 workflow 自己嘅 `GITHUB_TOKEN`
配 `permissions: packages: write` —— 每次 run 即發、只限呢個 repo、job 完
就消失。冇人要 mint、貼落 shell profile、或者記住 rotate。

`npm run domain:release`（本機 publish）仲留住做應急，但**正路係行 CI**。

## 兩個踩過嘅坑（2026-08-15）

**1. Package scope 必須等於 repo owner。**

```
npm error 403 Permission permission_denied: The requested installation does not exist.
```

當時個 repo 喺 `artssing`（個人帳號）名下，而 package 叫 `@certifine/domain`。
GitHub Packages 唔准跨主體發版 —— 開咗 `certifine` org 都仲係唔夠，**個
repo 本身**要住喺 org 度。已經喺 2026-08-15 transfer 咗。

**2. Workflow 一定要行 `prisma generate`。**

第一次 run 死喺 type-check：`@prisma/client has no exported member
ListingStatus`。Prisma client 係生成代碼，唔係 `npm ci` 裝得返嘅嘢。

---

## 發一版

改 `packages/domain/package.json` 個版本 → merge → 撳 tag：

```bash
git tag domain-v0.2.0 && git push origin domain-v0.2.0
```

Workflow 會核對 tag 同 `package.json` 一唔一致（唔一致即刻 fail）、行成個
repo 嘅 type-check、然後 publish。

> ⚠️ 同一個版本 publish 兩次會 409。要重發就 bump 版本，唔好重推 tag。

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
