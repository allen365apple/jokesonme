## 1. 複製前端與共用素材

- [x] 1.1 照 design「Copy front-end files under platform/public/live-vote」把 jokes-on-me `origin/main` 的 live-vote 前端（`index.html`、`vote.html`、`config.mjs`、`core.mjs`、`reveal.mjs`、`room-store.mjs`、`stage.mjs`、`store.mjs`、`ui.mjs`、`vote.mjs`、`style.css`、`vendor/supabase.js`、`vendor/supabase-license.txt`、勝利音效 mp3）原樣複製到 `platform/public/live-vote/`，滿足「Live vote pages served by the platform」與「External live vote backend contract」（`config.mjs` 照舊放 Supabase 網址與 publishable key，依 design「Supabase settings stay in config.mjs」）。驗證：對每個檔案跑 `cmp` 與來源一致；`git diff --stat` 顯示 `platform/supabase/migrations/` 沒有新檔；`grep -r jlv_live_ platform/app platform/lib platform/components` 沒有結果。
- [x] 1.2 照 design「Keep relative love-improv paths by copying shared assets」把 `love-improv/vendor/qrcode.js` 與 `love-improv/profiles/thumbs/*.jpg` 複製到 `platform/public/love-improv/` 對應位置，滿足「Shared live vote assets served by the platform」。驗證：`cmp` 一致；4.1 的本機載入中 QR 與頭像回 200。

## 2. 驗證

- [x] 2.1 在 `platform/eslint.config.mjs` 的 `globalIgnores` 加上 `public/live-vote/**` 與 `public/love-improv/**`，然後在 `platform/` 跑 `npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint`，輸出各寫進檔案再看，全部通過（確認 lint 與 typecheck 不掃 `public/`）。[after: 1.1, 1.2]
- [x] 2.2 本機 `npm run dev` 後開 `/live-vote/index.html?rehearsal=1`，走開放→加票→截止揭曉，確認頭像、QR、彩帶、音效檔載入成功且主控台沒有錯誤，QR 指向同網域的 `/live-vote/vote.html`；用沒有平台登入的瀏覽器開 `/live-vote/vote.html` 確認可開。[after: 2.1]

## 3. 部署後（PR 內文列出，Jesse 合併部署後執行）

- [ ] 3.1 照 design「Toolbox entry points to the platform address」與「Toolbox entry to the stage page」，在 `/tools` 編輯「看我笑話現場投票」卡片網址為 `https://jokesonme.jesse-chen.workers.dev/live-vote/index.html`。驗證：從工具箱點卡片在新分頁開到平台投影頁。
- [ ] 3.2 柏文用兩支手機在平台網址跑一輪正式投票：開放→投票→改投→截止揭曉→開下一輪，過程沒有錯誤（票的驗收 7）。驗證：柏文回報結果。
