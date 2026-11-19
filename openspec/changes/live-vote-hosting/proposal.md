## Why

現場投票（live-vote）的前端只在柏文個人的 jokes-on-me repo、部署在 GitHub Pages。傑哥要改畫面或流程，沒辦法在平台 repo 裡改，也不能跟平台一起部署。票 T-21 要把前端搬進平台 repo，跟平台一起部署；後端照舊放在柏文的 Supabase。

## What Changes

- 把 live-vote 的前端檔案複製進 `platform/public/live-vote/`：投影控制頁 `index.html`、觀眾投票頁 `vote.html`、`config.mjs`、`core.mjs`、`reveal.mjs`、`room-store.mjs`、`stage.mjs`、`store.mjs`、`ui.mjs`、`vote.mjs`、`style.css`、`vendor/`（Supabase SDK 與授權檔）、勝利音效 mp3。來源是 jokes-on-me `origin/main` 的最新版（已含攻隊／受隊與「輸贏附帶」）。
- 前端依賴的兩組共用素材一起複製，讓相對路徑照舊可用：`platform/public/love-improv/vendor/qrcode.js`（投影頁的 QR 產生器）與 `platform/public/love-improv/profiles/thumbs/*.jpg`（隊員頭像；正式房間存的頭像路徑是 `../love-improv/profiles/thumbs/…`）。
- 部署後投影頁在 `https://jokesonme.jesse-chen.workers.dev/live-vote/index.html`，觀眾頁在同一層的 `vote.html`；投影頁的 QR 會自動指向平台網址的觀眾頁。
- 觀眾頁不用登入、不用加 LINE 好友；平台沒有全站登入攔截，`public/` 底下的檔案本來就公開提供。
- 投影頁的入口放在登入後的「工具箱」（T-20）裡：部署後把「看我笑話現場投票」卡片的網址改成平台網址（在 `/tools` 頁面上編輯，不新增 migration）。
- 平台不新增任何 migration、不碰柏文的 Supabase 後端；前後端的介面是後端函式 `jlv_live_state`、`jlv_live_vote`、`jlv_live_command`、`jlv_live_history` 的名稱與參數。

## Non-Goals

- 不搬後端（`jlv_live_*` 表與函式、SQL 檔），也不改它們。
- 不把控制改成真的權限控管：後端控制函式仍是公開 RPC，登入只是把入口藏起來。要鎖住得另外改柏文的後端。
- 不套品牌設計系統：投影頁與投票頁沿用自己的舞台配色。
- 不搬 live-vote 的本機開發伺服器、`package.json` 與 node 測試；它們留在 jokes-on-me。
- 驗收 8（GitHub Pages 舊網址導到平台）由柏文在 jokes-on-me repo 自己做，不在這次 PR。

## Capabilities

### New Capabilities

- `live-vote-hosting`: 平台提供現場投票的投影控制頁與觀眾投票頁靜態檔，直連柏文的 Supabase 後端；包含檔案範圍、公開性、與後端的介面約定。

### Modified Capabilities

(none)

## Impact

- 新增檔案：platform/public/live-vote/ 底下的前端檔、platform/public/love-improv/vendor/qrcode.js、platform/public/love-improv/profiles/thumbs/ 底下 9 張頭像。
- 修改 platform/eslint.config.mjs：略過 `public/live-vote/**` 與 `public/love-improv/**`（複製來的靜態檔與壓縮過的第三方套件，不套平台的 lint 規則）。
- 新增 platform/public/live-vote/README.md：記錄來源版本與前後端約定。
- 不改其他既有程式碼、資料表或權限。
- 偏離 COLLABORATION.md 的四處（瀏覽器直連外部 Supabase、Supabase 網址與 publishable key 放在 `config.mjs` 送到瀏覽器、控制不經 `lib/auth/access.ts`、不套品牌設計系統），票上已列出請 Jesse 決定，PR 內文會再列一次請他確認。
