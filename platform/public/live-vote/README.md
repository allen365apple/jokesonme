<!--
最後更新：2026-11-19 14:20
誰幫忙的：Claude Code（Claude Opus 5.5）
修改摘要：票 T-21 把現場投票前端從 jokes-on-me 搬進平台，記錄來源版本與前後端約定
-->

# 看我笑話現場投票（前端）

- 投影控制頁：`/live-vote/index.html`；觀眾投票頁：`/live-vote/vote.html`（免登入）。
- 這個資料夾的檔案從 `allen365apple/jokes-on-me` 的 `live-vote/`（commit `cf13878`）原樣複製，`../love-improv/` 的 QR 產生器與頭像也一起複製到 `public/love-improv/`。
- 後端（`jlv_live_*` 資料表與函式）在柏文的 Supabase，由柏文維護，平台沒有對應的 migration。前後端的介面是 RPC `jlv_live_state`、`jlv_live_vote`、`jlv_live_command`、`jlv_live_history` 的名稱與參數；改後端時要維持相容，或同時送改這裡的 PR。
- `config.mjs` 只放 Supabase 網址與 publishable key（公開用），不可放 service role 或任何私密金鑰。
- 控制函式是公開 RPC：入口放在登入後的工具箱只是把入口藏起來，不是權限控管。
- 操作說明與後端 SQL 見 jokes-on-me repo 的 `live-vote/README.md`、`supabase-live.sql`。
