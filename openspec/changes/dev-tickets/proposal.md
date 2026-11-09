## Why

Jesse 想跟看我笑話的夥伴一起寫平台的程式（2026-11-09 已建好 GitHub 組織 `jokesonme-studio`、小組 `dev`）。現在要改平台只能口頭或在 LINE 群組講，沒有地方記「要改什麼、誰在做、做完了沒」，夥伴開工時也沒有一份統一的規矩可以照著做。另外平台只有一個正式資料庫，金鑰也只有一份，夥伴如果在自己電腦開發，就會直接碰到正式的財務與成員資料。

## What Changes

- 新增「開發票」頁面（路徑 `/tickets`），仿 Jebby Dashboard 任務懸賞的核心流程：開票、認領、交付、驗收通過或退回、不做、取消認領，每張票有票號 T-n 與歷史紀錄。
- 票頁提供「複製開工指令」按鈕。指令只告訴 Claude 去哪裡讀規矩、開哪個分支、怎麼交付，規矩本身只寫在 `COLLABORATION.md`。
- 新增資料表 `dev_tickets`、`dev_ticket_events`（migration 0017），沿用現有慣例：RLS 開啟不加 policy、掛操作紀錄 trigger。
- 新增「開發票」權限範圍：`admin` 與 `member` 可用，`finance_partner` 看不到也呼叫不到。
- 電腦版左側欄加「開發票」，手機底部導覽不加；手機仍可直接開網址。
- 新增 repo 根目錄 `COLLABORATION.md` 開發規範，與 `platform/.env.example`。
- 新增本機開發用的假帳號登入（只在非正式環境且 `DEV_LOGIN=1` 時存在）與開發資料庫的種子資料腳本，讓夥伴用另一個 Supabase 專案開發，不拿正式金鑰。

## Non-Goals (optional)

- 不做積分、排行榜、魔王副本、推薦解票人、Claude 工具串接（MCP）、截圖上傳、Slack 或 LINE 通知。第一版先跑核心流程，之後再評估。
- 不像 Jebby Dashboard 把票存在 GitHub issues。8 人團隊直接存 Supabase，認領用「只在沒人認領時才寫入」一次完成，不需要標籤與內文 meta。
- 不替夥伴建立開發用 Supabase 專案或 LINE 頻道；那些要 Jesse 本人在網頁操作，規範只寫步驟。
- 不改正式環境的部署方式；部署與正式 migration 仍只由 Jesse 做。

## Capabilities

### New Capabilities

- `dev-tickets`: 開發票的資料、狀態流轉、權限規則、頁面與開工指令。
- `local-dev-environment`: 本機開發的假帳號登入、開發資料庫種子資料、`.env.example` 與 `COLLABORATION.md` 開發規範。

### Modified Capabilities

- `line-login-access`: 角色權限表加入「開發票」，`admin`、`member` 可用，`finance_partner` 不可用。
- `mobile-first-ui`: 導覽改成目前實際的五個項目，並規定電腦版左側欄多一個「開發票」、手機底部導覽不顯示。

## Impact

- 資料庫：新增 platform/supabase/migrations/0017_dev_tickets.sql 與 platform/supabase/test/dev_tickets.test.sql；正式庫要由 Jesse 跑 db:migrate 才會有新表。
- 程式：新增 platform/app/(app)/tickets/ 頁面與 server actions、platform/lib/tickets/ 純函式與資料讀取、platform/components/ 的開發票元件；修改 platform/lib/auth/access.ts、platform/components/bottom-nav.tsx、platform/components/icons.tsx。
- 本機開發：新增 platform/app/api/dev/login/route.ts、platform/scripts/seed-dev.mts、platform/.env.example。
- 文件：新增 COLLABORATION.md。
- 不牽動 MCP：看我笑話平台沒有 MCP 端點，也不在傑比工具組 plugin 裡。
