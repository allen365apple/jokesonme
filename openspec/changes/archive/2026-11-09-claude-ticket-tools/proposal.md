## Why

開發票 T-1（傑哥 2026-11-09 開）：現在只能在平台「開發」頁手動開票與操作。用 Claude 做事時想到要改的地方，要另外打開平台再填一次，常常就忘了。Jesse 2026-11-09 拍板：做成夥伴可以安裝的外掛，讓 Claude 在任何資料夾都能替本人開票、查票、認領、交付、驗收，規則跟網頁一樣。

## What Changes

- 新增「連結 Claude」：平台「我的」頁可以產生一次性連結碼（10 分鐘內有效），列出已連結的電腦並撤銷。連結碼在外掛裡換成這台電腦專用的金鑰；資料庫只存雜湊值。
- 新增給外掛呼叫的 API `/api/claude/*`：連結、我是誰、版本、列出票、讀一張票（含歷史、可做的動作、開工指令）、開票、對票做動作。只接受連結金鑰，不接受網頁登入的 cookie；金鑰也不能用在這組端點以外的地方。
- 網頁與 API 共用同一套開發票操作（`planTransition` 判斷權限、`dev_ticket_apply` 原子寫入），規則完全一致；財務夥伴與未核准、已撤銷的人一律拒絕。
- 新增 migration 0018：`claude_link_codes`、`claude_tokens` 兩張表。
- 新增外掛 repo `jokesonme-studio/jokesonme-plugins`：外掛市集設定、`jokesonme` 外掛、零相依的本機連線程式（6 個工具）、「開票前先問清楚」的使用指引。

## Non-Goals (optional)

- 不讓 Claude 編輯票、重新開放已標「不做」的票；這兩個動作只在網頁上做。
- 不放進公司的 humanoid-tw 或傑比工具組外掛：看我笑話是個人專案。
- 不做通知、積分、截圖上傳。
- 不提供遠端直連（夥伴自己在終端機加網址與金鑰）的安裝方式；Jesse 選了外掛。

## Capabilities

### New Capabilities

- `claude-ticket-tools`: 連結碼與連結金鑰的發放、撤銷與使用範圍，給外掛用的開發票 API 契約，以及外掛工具的行為（未連結時的說明、寫入前先確認）。

### Modified Capabilities

(none)

## Impact

- 資料庫：新增 platform/supabase/migrations/0018_claude_tokens.sql 與 platform/supabase/test/claude_tokens.test.sql；合併後要由 Jesse 對正式庫跑 db:migrate。
- 程式：新增 platform/lib/claude/（金鑰產生與驗證）、platform/lib/tickets/operations.ts（網頁與 API 共用的開票與動作）、platform/app/api/claude/ 底下的端點、platform/app/(app)/me/ 的連結區塊與 actions；修改 platform/app/(app)/tickets/actions.ts 改呼叫共用操作。
- 新 repo：jokesonme-studio/jokesonme-plugins（公開，不含任何金鑰）。
- 文件：COLLABORATION.md 加一段「用 Claude 開票」。
- MCP：新增看我笑話自己的 MCP（外掛裡的本機連線程式）；不牽動傑比工具組的 MCP／plugin。
