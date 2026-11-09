## 1. 資料庫

- [x] 1.1 （spec「Link code issuance」「Link exchange」「Key revocation」；design「連結碼換本機金鑰，資料庫只存雜湊」）新增 `platform/supabase/migrations/0018_claude_tokens.sql`：`claude_link_codes`、`claude_tokens` 兩張表（雜湊欄位 unique、RLS 開無 policy、只給 service_role 需要的權限、不給 DELETE、掛 `attach_audit`）。驗證：新增 `platform/supabase/test/claude_tokens.test.sql` 覆蓋「無 actor 寫入被擋」「雜湊重複被擋」「service_role 不能硬刪」「anon 讀不到」，`npm run test:db` 全綠。

## 2. 金鑰與驗證

- [x] 2.1 （spec「Link code issuance」「Link exchange」）新增 `platform/lib/claude/tokens.ts`：產生連結碼與金鑰（格式照 design）、`hashSecret`、到期判斷。驗證：新增 `platform/lib/claude/tokens.test.ts`，斷言格式正規式、同一輸入雜湊相同、9 分 59 秒未過期與 10 分 01 秒已過期。
- [x] 2.2 （spec「Key scope and authentication」；design「API 只認 Bearer 金鑰，金鑰只認這組 API」）新增 `platform/lib/claude/auth.ts` 的 `authenticateClaude`，查詢與時間用可替換的相依注入以便測試；超過 1 小時才更新 `last_used_at`。[after: 1.1, 2.1] 驗證：新增 `platform/lib/claude/auth.test.ts` 覆蓋缺 header、格式錯、未知、已撤銷、未核准、finance_partner、只有 cookie 沒有 header，以及正常回傳使用者。
- [x] 2.3 （spec「Link code issuance」「Link exchange」「Key revocation」）新增連結碼與金鑰的資料操作 `platform/lib/claude/links.ts`：產生碼（作廢舊碼）、換發金鑰（標記已用）、列出自己的金鑰、撤銷自己的金鑰。[after: 2.1] 驗證：本機開發庫手動走一次產生 → 換發 → 重用失敗 → 撤銷；`npm run typecheck` 通過。

## 3. 開發票共用操作與 API

- [x] 3.1 （spec「Ticket API parity」；design「網頁與 API 共用同一套開發票操作」）新增 `platform/lib/tickets/operations.ts` 的 `createTicketAs`、`actOnTicketAs`，把 `platform/app/(app)/tickets/actions.ts` 改成呼叫它們，行為不變。驗證：`npm run test` 與 `npm run typecheck` 通過；本機開發庫在網頁上再走一次 開票 → 認領 → 交付 → 驗收，結果與改動前相同。
- [x] 3.2 （spec「Link exchange」「Key scope and authentication」「Ticket API parity」）新增 `platform/app/api/claude/` 底下的 `link`、`version`、`whoami`、`tickets`、`tickets/[number]`、`tickets/[number]/actions` 端點，回應格式與錯誤碼照 design 的介面表；`edit`、`reopen` 回 400。[after: 2.2, 2.3, 3.1] 驗證：本機用 `curl` 帶開發庫的金鑰逐一呼叫，確認 200／201／400／401／403／404／409 各至少出現一次且訊息為中文；只帶 cookie 呼叫回 401。

## 4. 「我的」頁

- [x] 4.1 （spec「Link code issuance」「Key revocation」）「我的」頁加「連結 Claude」區塊：產生連結碼（顯示碼、到期時間、可複製的一句話與安裝外掛的指令）、列出已連結的電腦與撤銷；只給 admin、member；樣式只用既有 token。[after: 2.3] 驗證：本機以 `dev-member` 產碼與撤銷、以 `dev-finance` 看不到區塊；1280px 與 390px 截圖。

## 5. 外掛 repo

- [x] 5.1 （spec「Plugin tools」；design「做成外掛，本機連線程式轉呼叫平台 API」「外掛工具」）建立公開 repo `jokesonme-studio/jokesonme-plugins`：`.claude-plugin/marketplace.json`、`plugins/jokesonme/.claude-plugin/plugin.json`、`.mcp.json`、`mcp/jokesonme.mjs`（6 個工具、不 import 任何套件、設定檔權限 0600、`JOKESONME_URL` 可覆寫）。[after: 3.2] 驗證：repo 內 `node --test` 覆蓋未連結訊息、設定檔讀寫與權限、initialize／tools/list／tools/call、平台 401 轉成未連結說明。
- [x] 5.2 （spec「Ticket filing guidance」）新增 `plugins/jokesonme/skills/ticket-rules/SKILL.md`：開票前問清楚四段、用 `list_tickets` 查重複、列草稿確認才開；並寫 repo 的 `README.md` 安裝說明。[after: 5.1] 驗證：內容逐項對照 spec「Ticket filing guidance」。

## 6. 端到端與文件

- [x] 6.1 （spec「Ticket API parity」「Plugin tools」）本機端到端：以 `JOKESONME_URL=http://localhost:3107` 執行外掛程式，依 design 驗收清單走完 產碼 → link_account → create_ticket（回報人是本人）→ 另一個假帳號認領、交付 → 回報人驗收 → 撤銷後回未連結說明。[after: 4.1, 5.1] 驗證：每一步的工具輸出與網頁畫面一致，記錄在 PR 內文。
- [x] 6.2 （spec「Ticket filing guidance」）`COLLABORATION.md` 加「用 Claude 開票」一段：安裝外掛（終端機與 App 兩種）、連結、撤銷。[after: 5.2] 驗證：內容對照 design 的安裝說明；`kickoff.test.ts` 的反向測試仍通過。
- [x] 6.3 全部自檢。[after: 6.1, 6.2] 驗證：`npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint` 與外掛 repo 的 `node --test` 都通過，輸出寫進檔案再看退出碼。
