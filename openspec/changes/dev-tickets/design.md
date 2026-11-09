## Context

看我笑話平台（`platform/`）是 Next.js 16（App Router）＋ Supabase（伺服器用 secret key 經 `db(actor)` 存取，瀏覽器不直連）＋ Cloudflare Worker。權限由 `lib/auth/access.ts` 的 `checkAccess(user, area)` 統一判斷，頁面用 `requirePage`、server action 用 `requireAction`。每張表 RLS 開啟不加 policy、`attach_audit` 掛操作紀錄，寫入必須帶 actor。

2026-11-09 Jesse 建了 GitHub 組織 `jokesonme-studio` 與小組 `dev`，要跟看我笑話夥伴一起開發。參考對象是 Jebby Dashboard 的任務懸賞：那邊把票存在 GitHub issues（標籤記狀態、內文藏 meta），開工指令由 `lib/tickets/kickoff.ts` 產生、只指路不抄規矩，規矩集中在 `COLLABORATION.md`。

目前平台只有正式 Supabase 一組金鑰（`platform/.env.local`），沒有開發環境；登入只有 LINE Login 與 LIFF。

## Goals / Non-Goals

**Goals:**

- 成員能在平台開票、認領、交付、驗收，每一步有紀錄，不會兩個人同時認領同一張。
- 認領人一鍵複製開工指令，貼給 Claude 就能照 `COLLABORATION.md` 開工。
- 夥伴在自己電腦開發時只連開發用 Supabase，不需要也拿不到正式金鑰；本機不用設 LINE 頻道也能登入。

**Non-Goals:**

- 積分、排行榜、魔王副本、推薦解票人、MCP、截圖上傳、Slack／LINE 通知。
- 把票存進 GitHub issues。
- 自動偵測 PR 合併或部署後自動轉狀態（Dashboard 曾因自動轉狀態誤轉三張只做一部分的票，改成人工按交付）。
- 建立開發用 Supabase 專案、LINE 頻道、Cloudflare 帳號；這些由 Jesse 在網頁操作，`COLLABORATION.md` 只寫步驟。

## Decisions

### 票存在 Supabase，不存 GitHub issues

票與歷史分別存在 `dev_tickets`、`dev_ticket_events`。8 人團隊不需要 Dashboard 那套標籤與 meta 區塊，也不會有「不要在票倉開 PR」這種規矩。替代方案「照抄 GitHub issues」被否決：要多一個 repo、GitHub token、標籤初始化腳本，而且認領防撞要「讀－寫－再讀」三步。

### 狀態轉換由一支資料庫函式原子完成，權限判斷在 TypeScript 純函式

`lib/tickets/flow.ts` 的 `planTransition(ticket, action, actor)` 是純函式：輸入目前的票、動作、操作者（id 與 role），回傳「要從哪個狀態轉到哪個狀態、要改哪些欄位、事件內容」或一個中文錯誤原因。server action 先讀票、呼叫 `planTransition`，再呼叫資料庫函式 `dev_ticket_apply(p_id, p_expect_status, p_expect_owner, p_patch, p_event)`：函式在同一個交易裡 `update ... where id = p_id and status = p_expect_status and owner_id is not distinct from p_expect_owner`，更新到 0 列就回傳 null（代表票剛被別人改過），否則插入一筆事件並回傳新的票。

這樣「認領」天然防撞：兩人同時認領時，第二個人的期望值是 `owner_id is null`，第一個人寫入後就對不上。替代方案「把權限也寫進 SQL」被否決：權限規則要單元測試，TypeScript 純函式用 `node --test` 就能測，SQL 只負責原子性。

### 狀態與動作

| 狀態代碼 | 畫面名稱 |
| --- | --- |
| `open` | 待處理 |
| `in_progress` | 處理中 |
| `review` | 待驗收 |
| `done` | 已完成 |
| `wontfix` | 不做 |

| 動作 | 從 → 到 | 誰可以 | 其他 |
| --- | --- | --- | --- |
| `claim` 認領 | open → in_progress | admin、member | 只有沒人認領時；owner 設成自己 |
| `unclaim` 取消認領 | in_progress → open | 認領人、回報人、admin | owner 清空 |
| `deliver` 交付 | in_progress → review | 認領人、admin | |
| `accept` 驗收通過 | review → done | admin；或回報人且不是認領人 | |
| `reject` 退回 | review → in_progress | 同 accept | 必填原因 |
| `wontfix` 不做 | open／in_progress／review → wontfix | 回報人、admin | 必填原因；owner 保留 |
| `reopen` 重新開放 | wontfix → open | admin | owner 清空 |
| `edit` 編輯 | open 且沒人認領 | 回報人、admin | 只改標題、分類、描述 |

admin 可以驗收自己做的票：目前 admin 只有 Jesse，若禁止，Jesse 自己開又自己做的票會沒人能驗收。

### 票號用資料庫遞增數字

`dev_tickets.number` 是 `generated always as identity`，畫面與開工指令顯示成 `T-<number>`。刪除不做硬刪；用「不做」結案，號碼不重用。

### 開工指令只指路

`lib/tickets/kickoff.ts` 的 `kickoffText(ticket, reporterName)` 產生純文字，結構：

1. 一句話說明要修的是 T-n《標題》（分類，回報人）。
2. 第一步讀 repo 根目錄 `COLLABORATION.md` 照做，規矩以那份為準。
3. 從最新的 main 開分支 `feat/T-<n>-<短名>`。
4. 依 `COLLABORATION.md` 判斷要不要用 `/spectra-propose` 寫提案。
5. 改好先停，告訴操作的人改了什麼、怎麼看效果，確認後才 push 並開 PR。
6. PR 標題 `fix(T-<n>): <說明>`，不要自行合併。
7. Jesse 合併並部署後，回 `/tickets?t=<n>` 按「交付」。
8. 附上票的描述全文，註明以描述為準。

`lib/tickets/kickoff.test.ts` 有反向測試：開工指令不得出現 `COLLABORATION.md` 才該寫的規矩字串（例如 `db:migrate`、`.env.local`、`SUPABASE_`、`git add`），避免規矩被抄進模板而兩邊不同步。

### 開發環境：另一個 Supabase 專案＋假帳號登入

- `platform/.env.local` 多兩個開關：`JK_ENV=development` 標示這份金鑰是開發用；`DEV_LOGIN=1` 開啟假帳號登入。正式環境兩者都不設。
- `GET /api/dev/login?as=<userId>&next=<path>`：`lib/auth/dev-login.ts` 的 `devLoginEnabled(env)` 只在 `NODE_ENV !== "production"` 且 `DEV_LOGIN === "1"` 且 `JK_ENV === "development"` 時回 true，否則路由回 404。啟用時查 `users` 表，該使用者存在且已核准才簽 session，沿用 `signSession`。
- `platform/scripts/seed-dev.mts`：只在 `JK_ENV=development` 時執行，否則印出原因並以非零退出碼結束。只 upsert 固定 id 的假資料（`dev-admin`、`dev-member`、`dev-finance` 三個使用者與兩張範例票），不刪除任何資料，最壞情況是在錯的資料庫多出幾列假資料，可以手動移除。
- 替代方案「本機跑 Supabase CLI（Docker）」被否決：夥伴電腦要裝 Docker，門檻太高；免費 Supabase 專案多開一個即可。

### 入口只放電腦版左側欄

`components/bottom-nav.tsx` 的項目加 `deskOnly` 欄位，「開發」頁帶 `desk-only` class（`globals.css` 已有：寬度 899px 以下隱藏）。手機直接打 `/tickets` 仍可使用，頁面本身照手機優先排版。

## Implementation Contract

**Behavior**

- `admin`、`member` 打開 `/tickets` 看到「進行中」（待處理、處理中、待驗收）與「已結案」（已完成、不做）兩個分頁，以及「只看我的」篩選；每張卡片顯示狀態、`T-n`、標題、分類、回報人、認領人。
- 「開一張票」開啟表單：標題（1–120 字）、分類（新功能／修 Bug／改善流程／修正資料）、描述（預填四段：現在怎樣、希望變成、做完看得到什麼（驗收）、誰會用、誰看得到）。
- 點卡片以 `?t=<n>` 開啟票頁：顯示「現在輪到誰、下一步」、只給有權限的人看到對應按鈕、描述、歷史紀錄（每次轉狀態的人、時間、原因）。認領人與 admin 看得到「複製開工指令」按鈕。
- 退回與不做要填原因，空白時按鈕不送出並提示。
- 操作失敗（權限不足、票剛被改過）時，頁面顯示中文原因，例如「這張票剛被柏文認領了，重新整理看看」，不顯示技術錯誤。
- `finance_partner` 開 `/tickets` 會被導回自己的首頁；直接呼叫 server action 會丟出 forbidden。

**Interface / data shape**

- 資料表 `dev_tickets(id uuid, number bigint identity unique, title text, category text, description text, status text, reporter_id text, owner_id text null, created_at, updated_at)`；`category` 與 `status` 用 check constraint 限定代碼。
- 資料表 `dev_ticket_events(id uuid, ticket_id uuid, actor_id text, action text, note text, at timestamptz)`。
- 資料庫函式 `dev_ticket_apply(p_id uuid, p_expect_status text, p_expect_owner text, p_patch jsonb, p_event jsonb) returns dev_tickets`；只授權 `service_role`。
- `Area` 加 `"tickets"`：admin、member 有，finance_partner 沒有。
- `lib/tickets/flow.ts`：`planTransition(ticket, action, actor, note?) => { ok: true, expectStatus, expectOwner, patch, event } | { ok: false, reason }`。
- `lib/tickets/kickoff.ts`：`kickoffText(ticket, reporterName) => string`。
- `lib/auth/dev-login.ts`：`devLoginEnabled(env) => boolean`。

**Failure modes**

- `dev_ticket_apply` 回傳 null → server action 回「票剛被改過」訊息，不寫事件。
- 缺 actor 寫入 → audit trigger 擋下（既有行為）。
- `seed-dev.mts` 在沒有 `JK_ENV=development` 時拒絕執行並說明原因。
- `/api/dev/login` 在條件不符時一律 404，不透露原因。

**Acceptance criteria**

- `npm run test` 通過，含 `lib/tickets/flow.test.ts`（每個動作的允許／拒絕表）、`lib/tickets/kickoff.test.ts`（包含必要指路、反向測試）、`lib/auth/dev-login.test.ts`、更新後的 `lib/auth/access.test.ts`。
- `npm run test:db` 通過，含 `supabase/test/dev_tickets.test.sql`：無 actor 寫入被擋、`dev_ticket_apply` 期望值不符回 null、兩次認領只有一次成功、service_role 不能硬刪、anon 不能讀。
- `npm run typecheck`、`npm run lint` 通過。
- 本機用開發庫手動走一次：開票 → 另一個假帳號認領 → 交付 → 回報人驗收；退回需原因；finance_partner 被擋。

**Scope boundaries**

- In scope：上述兩張表、一支函式、頁面與 actions、導覽、權限範圍、開工指令、假帳號登入、種子腳本、`.env.example`、`COLLABORATION.md`。
- Out of scope：Non-Goals 列出的項目；正式庫 migration 的實際執行（由 Jesse 合併後跑）；GitHub 組織成員邀請。

## Risks / Trade-offs

- [假帳號登入誤開在正式環境] → 三個條件同時成立才啟用，其中 `NODE_ENV` 在 Cloudflare 建置時一定是 production；`lib/auth/dev-login.test.ts` 覆蓋三個條件各自不成立的情況。
- [種子腳本打到正式庫] → 需要 `JK_ENV=development`，正式 `.env.local` 沒有這個值；且腳本只 upsert 固定 id、不刪資料。
- [server action 讀票與寫入之間被別人改] → `dev_ticket_apply` 用期望狀態與期望認領人比對，對不上就不寫，使用者重新整理即可。
- [事件與狀態不同步] → 兩者在同一個資料庫交易內完成。
- [開工指令與規範不同步] → 規矩只寫在 `COLLABORATION.md`，反向測試擋住常見規矩字串被抄進模板。
