## Context

開發頁（change dev-tickets，2026-11-09 上線）只能在網頁操作。T-1 要讓 Claude 在任何資料夾替本人開票與操作票。Jesse 選擇「做成可安裝的外掛」，參考傑比工具組裡 Dashboard 的做法：外掛內一支不靠任何套件的 node 程式，用 stdio 一行一則 JSON-RPC 跟 Claude 溝通；同事在網站拿連結碼、交給 Claude 換成本機金鑰（存在使用者家目錄的設定檔），之後每個工具都帶這把金鑰呼叫網站的 HTTP API。

平台現況：登入只有 LINE Login／LIFF 的 session cookie（`lib/auth/session.ts`）；權限統一由 `lib/auth/access.ts` 的 `checkAccess` 判斷；開發票的寫入集中在 `app/(app)/tickets/actions.ts`，用 `lib/tickets/flow.ts` 的 `planTransition` 判斷、資料庫函式 `dev_ticket_apply` 原子寫入。

看我笑話是個人專案：不能放進公司 humanoid-tw 組織或傑比工具組外掛。

## Goals / Non-Goals

**Goals:**

- 夥伴裝一次外掛、用連結碼綁定後，在任何資料夾都能請 Claude 開票、列出票、看票、認領、取消認領、交付、驗收、退回、標不做。
- 票的回報人、認領人、歷史紀錄都是金鑰的主人本人；權限規則跟網頁完全一致。
- 金鑰只能用在開發票 API，不能讀財務等其他資料；可以在平台撤銷。
- Claude 開票前一定先把標題、分類、四段描述列給使用者確認。

**Non-Goals:**

- 透過 Claude 編輯票、重新開放「不做」的票。
- 放進公司的組織或傑比工具組。
- 通知、積分、截圖上傳。
- 「夥伴自己在終端機加遠端網址與金鑰」的安裝方式。

## Decisions

### 做成外掛，本機連線程式轉呼叫平台 API

外掛 `jokesonme`（repo `jokesonme-studio/jokesonme-plugins`）的 `.mcp.json` 啟動 `mcp/jokesonme.mjs`。這支程式不 import 任何套件（外掛資料夾沒有 node_modules），只用 node 內建模組與 `fetch`。替代方案「平台直接提供遠端 MCP 網址」被否決：夥伴要自己開終端機貼指令與金鑰，對不寫程式的成員不友善，也沒辦法附帶「開票前先問清楚」的使用指引。

### 連結碼換本機金鑰，資料庫只存雜湊

- 連結碼格式 `jk_link_` 加 24 個十六進位字元，10 分鐘有效、只能用一次；同一人產生新碼時，舊的未使用碼立即作廢。
- 金鑰格式 `jk_cl_` 加 64 個十六進位字元，只在換發當下回傳一次。
- 兩者在資料庫都只存 SHA-256 十六進位雜湊（`lib/claude/tokens.ts` 的 `hashSecret`）；拿到資料庫的人也拿不到能用的碼或金鑰。
- 本機設定檔：macOS／Linux 為 `~/.config/jokesonme/claude.json`，Windows 為 `%APPDATA%\Jokesonme\claude.json`，權限 0600，內容 `{ baseUrl, token, name, linkedAt }`。

替代方案「直接讓使用者複製長金鑰」被否決：長金鑰容易被貼到聊天或截圖外洩；連結碼 10 分鐘就失效。

### API 只認 Bearer 金鑰，金鑰只認這組 API

`/api/claude/*` 的每個端點都先呼叫 `lib/claude/auth.ts` 的 `authenticateClaude(request)`：讀 `Authorization: Bearer <金鑰>`，雜湊後查 `claude_tokens`（未撤銷），再讀 `users`；使用者必須已核准且 `checkAccess(user, "tickets")` 通過。這組端點完全不讀 session cookie，所以瀏覽器的登入狀態不能拿來呼叫；其他頁面與 server action 也不認 Bearer 金鑰，所以金鑰碰不到財務。`last_used_at` 只在距上次超過 1 小時才更新，避免每次呼叫都寫資料庫。

### 網頁與 API 共用同一套開發票操作

把 `app/(app)/tickets/actions.ts` 的開票與動作邏輯搬到 `lib/tickets/operations.ts`：`createTicketAs(user, input)`、`actOnTicketAs(user, ticketRef, action, input)`，回傳 `{ ok: true, ... } | { ok: false, error, status }`。server action 與 API 都呼叫它們；寫入一律用 `db("user:<id>")`，所以操作紀錄與票的回報人都是本人。API 拒絕 `edit` 與 `reopen`（回 400「這個動作請到網頁上做」）。

### 外掛工具

| 工具 | 呼叫 | 會寫入 |
| --- | --- | --- |
| `whoami` | GET `/api/claude/whoami` | 否 |
| `link_account` | POST `/api/claude/link` | 本機設定檔 |
| `list_tickets` | GET `/api/claude/tickets?seg=&mine=` | 否 |
| `get_ticket` | GET `/api/claude/tickets/<n>` | 否 |
| `create_ticket` | POST `/api/claude/tickets` | 是 |
| `act_on_ticket` | POST `/api/claude/tickets/<n>/actions` | 是 |

會寫入平台的兩個工具，描述第一句寫明「呼叫前先把內容列給使用者確認，對方說好才呼叫」。沒有設定檔、或平台回 401 時，工具回傳固定說明：到平台「我的」→「連結 Claude」產生連結碼，跟 Claude 說「連結看我笑話，代碼 jk_link_…」。外掛另附使用指引 `skills/ticket-rules/SKILL.md`：使用者說要開票時，先問清楚四段、用 `list_tickets` 看有沒有重複、列草稿確認後才開。

平台網址預設 `https://jokesonme.jesse-chen.workers.dev`；環境變數 `JOKESONME_URL` 可覆寫（本機測試用）。`GET /api/claude/version` 回 `{ api: 1 }`，`whoami` 時比對，版本不符就提示更新外掛。

### 外掛 repo 公開

repo 內只有程式與說明，沒有任何金鑰；公開讓夥伴不需要 GitHub 權限也能安裝。夥伴能否在桌面 App 安裝私有 repo 的外掛市集未驗證，所以不選私有。

## Implementation Contract

**Behavior**

- 「我的」頁（admin、member）多一個「連結 Claude」區塊：按「產生連結碼」顯示碼、到期時間、可複製的一句話「連結看我笑話，代碼 jk_link_…」與安裝外掛的兩行指令；下方列出已連結的電腦（名稱、連結時間、最後使用時間）與「撤銷」。財務夥伴看不到這個區塊。
- 在 Claude 說「連結看我笑話，代碼 jk_link_…」→ `link_account` 存好設定檔並回「已連結為 <名字>」。
- 在任何資料夾說「幫我開一張票」→ Claude 依使用指引問清楚、列草稿；使用者同意後 `create_ticket`，回報人是本人，平台「開發」頁立刻看得到。
- 列票、看票、認領、取消認領、交付、驗收、退回、不做都可以透過工具做，結果與網頁相同；不被允許的動作回網頁同一句中文原因。

**Interface / data shape**

- `claude_link_codes(id uuid, user_id text, code_hash text unique, expires_at timestamptz, used_at timestamptz null, created_at)`
- `claude_tokens(id uuid, user_id text, token_hash text unique, device_name text, created_at, last_used_at timestamptz null, revoked_at timestamptz null)`
- POST `/api/claude/link` `{ code, device }` → 200 `{ token, name }`；碼無效、過期、用過 → 400 `{ error }`。
- GET `/api/claude/whoami` → `{ id, name, role, api: 1 }`
- GET `/api/claude/tickets?seg=active|closed&mine=1` → `{ tickets: [{ number, title, category, status, reporter, owner }] }`
- GET `/api/claude/tickets/<n>` → `{ ticket, history, allowedActions, nextStep, kickoff|null }`
- POST `/api/claude/tickets` `{ title, category, description }` → 201 `{ number }`
- POST `/api/claude/tickets/<n>/actions` `{ action, note? }` → 200 `{ ok: true, status }`
- 錯誤一律 `{ error: "<中文原因>" }`；401 未連結或已撤銷、403 沒有開發頁權限、404 找不到票、409 票剛被改過、400 輸入或動作不合規則。

**Failure modes**

- 連線不到平台：工具回「連不到看我笑話平台，請確認網路後再試」。
- 設定檔壞掉或格式不對：當作未連結。
- `last_used_at` 更新失敗不影響請求結果。

**Acceptance criteria**

- `npm run test` 通過，含 `lib/claude/tokens.test.ts`（碼與金鑰格式、雜湊、到期判斷）、`lib/claude/auth.test.ts`（缺 header、格式錯、撤銷、財務夥伴、cookie 不算數）、`lib/tickets/operations.test.ts` 不需資料庫的部分。
- `npm run test:db` 通過，含 `supabase/test/claude_tokens.test.sql`（只存雜湊、一次性、撤銷、權限）。
- 外掛 repo 的 `node --test` 通過（未連結訊息、設定檔讀寫與權限 0600、JSON-RPC 的 initialize／tools/list／tools/call、平台 401 轉成未連結說明）。
- 本機用開發用 Supabase 與 `JOKESONME_URL=http://localhost:3107` 手動走：產生連結碼 → link_account → create_ticket → 網頁看得到、回報人是本人 → 用另一個假帳號認領、交付 → 回報人用工具驗收；撤銷後工具回未連結說明；`dev-finance` 產生不了連結碼。

**Scope boundaries**

- In scope：migration 0018、`lib/claude/`、`lib/tickets/operations.ts`、`/api/claude/*`、「我的」頁連結區塊、外掛 repo、`COLLABORATION.md` 一段說明。
- Out of scope：Non-Goals 的項目；把外掛放進任何公司的市集；正式庫 migration 的執行（Jesse 合併後做）。

## Risks / Trade-offs

- [金鑰外洩] → 只存雜湊、一次顯示、可撤銷、只能操作開發票；設定檔權限 0600。
- [舊連結碼被重複使用] → 一次性加 10 分鐘到期，產新碼時舊碼作廢；`claude_tokens.test.sql` 覆蓋重用失敗。
- [外掛與平台版本不一致] → `api` 版本號比對並提示更新外掛。
- [桌面 App 安裝外掛的流程未實測] → 實作後由 Jesse 在自己的 Claude 裝一次確認；`COLLABORATION.md` 寫終端機與 App 兩種裝法。
