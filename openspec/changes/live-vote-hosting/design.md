## Context

live-vote 是純前端（ES modules＋Supabase JS SDK），部署在 GitHub Pages 的 `jokes-on-me/live-vote/`，後端是柏文 Supabase 專案裡的 `jlv_live_*` 表與 RPC。前端透過相對路徑依賴同一個 repo 的 `../love-improv/vendor/qrcode.js` 與 `../love-improv/profiles/thumbs/*.jpg`；正式房間快照裡存的頭像也是 `../love-improv/profiles/thumbs/…` 相對路徑，後端驗證只接受這個前綴或 `https://`。平台用 OpenNext 部署到 Cloudflare Workers，`wrangler.toml` 的 `[assets]` 會直接提供 `platform/public/` 的靜態檔；平台沒有 middleware 或全站登入攔截。

## Goals / Non-Goals

**Goals:**

- 前端放進平台 repo、跟平台一起部署，傑哥能直接在平台 repo 改。
- 功能與 GitHub Pages 版完全相同，正式房間的資料不用遷移。

**Non-Goals:**

- 後端搬家或修改、真的權限控管、套品牌設計系統、搬 node 測試與開發伺服器、GitHub Pages 導向（柏文自己做）。

## Decisions

### Copy front-end files under platform/public/live-vote

照票列的清單把檔案原樣複製到 `platform/public/live-vote/`，不經過 Next 的頁面或打包。替代方案：改寫成 Next 頁面——要重寫整個舞台與動畫、風險高、偏離「只搬前端」，不選。

### Keep relative love-improv paths by copying shared assets

把 `qrcode.js` 複製到 `platform/public/love-improv/vendor/`、9 張頭像複製到 `platform/public/love-improv/profiles/thumbs/`，維持 `../love-improv/...` 相對路徑可用。替代方案：把路徑改成 GitHub Pages 絕對網址——正式房間快照裡已存的相對路徑會在平台上 404，而且要改程式碼，不選。

### Supabase settings stay in config.mjs

Supabase 網址與 publishable key（公開用、只能呼叫公開 RPC）照舊寫在 `public/live-vote/config.mjs`。替代方案：環境變數——靜態檔沒有建置步驟可注入，得另寫一支 route 吐設定，複雜度不值得；這把 key 現在已公開在 GitHub Pages。此項偏離「金鑰絕不能送到瀏覽器」，列為待 Jesse 確認。

### Toolbox entry points to the platform address

投影控制頁的入口是工具箱（T-20）的「看我笑話現場投票」卡片；部署後在 `/tools` 編輯該卡片網址為 `https://jokesonme.jesse-chen.workers.dev/live-vote/index.html`，不新增 migration。卡片網址用明確的 `index.html`，避免依賴目錄索引在 `next dev` 與 Cloudflare 上行為不同。

## Implementation Contract

**Behavior**
- `GET /live-vote/index.html` 回投影控制頁，連上柏文的 Supabase 後顯示「即時連線正常」與兩隊；`GET /live-vote/vote.html` 回觀眾頁，未登入也能開。
- 投影頁 QR 指向與投影頁同一個網域下的 `/live-vote/vote.html`（由 `new URL("./vote.html", location.href)` 算出）。
- 頭像與 QR 產生器從平台網域載入，不再依賴 GitHub Pages。

**Interface / data shape**
- 前後端介面：RPC `jlv_live_state(p_device uuid)`、`jlv_live_vote(p_round uuid, p_device uuid, p_team text)`、`jlv_live_command(...)`、`jlv_live_history(...)`，名稱與參數以柏文的 `supabase-live.sql` 為準。柏文改後端時要維持相容，或同時送改前端的 PR。
- 檔案：`platform/public/live-vote/{index.html, vote.html, config.mjs, core.mjs, reveal.mjs, room-store.mjs, stage.mjs, store.mjs, ui.mjs, vote.mjs, style.css, vendor/supabase.js, vendor/supabase-license.txt, 音效素材 001 戰鬥勝利.mp3}`、`platform/public/love-improv/vendor/qrcode.js`、`platform/public/love-improv/profiles/thumbs/*.jpg`。

**Failure modes**
- 後端暫停或連不上：頁面沿用原本的提示（toast 顯示錯誤、狀態「正在準備」），平台不另外處理。
- 平台其他頁面不受影響：靜態檔與 Next 路由沒有路徑衝突（`app/` 沒有 `live-vote`、`love-improv` 路由）。

**Acceptance criteria**
- 複製後的檔案與 jokes-on-me `origin/main` 對應檔逐一 byte 相同（`cmp` 全部一致）。
- 本機 `npm run dev` 下用排練模式（`/live-vote/index.html?rehearsal=1`）走完開放→加票→截止揭曉，彩帶、音效檔、頭像、QR 都載入成功、主控台沒有錯誤。
- 觀眾頁在未登入的瀏覽器開得起來。
- 四項自檢（test、test:db、typecheck、lint）照常通過（確認 lint／typecheck 不掃 `public/`）。
- 驗收 7（兩支手機跑一輪正式投票）在部署後由柏文做，PR 內文列為部署後待驗。

**Scope boundaries**
- In scope：上述檔案複製、PR 內文列出四處偏離與部署後步驟。
- Out of scope：後端、權限控管、品牌樣式、node 測試、GitHub Pages 導向、工具箱程式（T-20）。

## Risks / Trade-offs

- [前端兩份並存一段時間（GitHub Pages 與平台）] → 柏文做完驗收 8 的導向後只維護平台這份；導向前的改動要兩邊同步。
- [控制函式公開，任何拿到網址的人都能開票、清票] → 與 GitHub Pages 版相同風險；票上已說明，要鎖住得改後端。
- [平台與 GitHub Pages 是不同網域，投影機瀏覽器存的「輸贏附帶」偏好不會帶過去] → 第一次在平台開投影頁會用預設「輸隊要穿囚服拍照！」，在控制台改一次即可。
- [Supabase 免費方案閒置會自動暫停] → 與搬家無關；演出前先開一次投影頁確認連線。

## Migration Plan

- Jesse 合併部署後，在 `/tools` 把「看我笑話現場投票」卡片網址改成平台網址。
- 柏文用兩支手機跑一輪正式投票（驗收 7），再在 jokes-on-me 做 GitHub Pages 導向（驗收 8）。
- 回滾：刪掉 `platform/public/live-vote/` 與兩組素材、卡片網址改回 GitHub Pages。

## Open Questions

- 票上請 Jesse 決定的四處偏離（直連外部 Supabase、key 放 `config.mjs`、控制不經 `access.ts`、不套品牌設計系統），這份提案採上面的做法，等 Jesse 在 PR 確認。
