## 1. 資料庫

- [x] 1.1 （spec「Ticket record」「Conflict-safe claiming」「Ticket history」；design「票存在 Supabase，不存 GitHub issues」「狀態轉換由一支資料庫函式原子完成，權限判斷在 TypeScript 純函式」「票號用資料庫遞增數字」）新增 migration `platform/supabase/migrations/0017_dev_tickets.sql`：建立 `dev_tickets`（`number` 為 identity、`category`／`status` 用 check 限定代碼、標題 1–120 字）與 `dev_ticket_events`，RLS 開啟不加 policy、只給 service_role select／insert／update、掛 `attach_audit`；建立 `dev_ticket_apply(p_id, p_expect_status, p_expect_owner, p_patch, p_event)`，在同一交易裡比對期望狀態與期望認領人，對不上回 null、對上就更新並寫一筆事件；收回 public 的 execute、只授權 service_role。驗證：新增 `platform/supabase/test/dev_tickets.test.sql` 覆蓋「無 actor 寫入被擋」「期望值不符回 null 且不寫事件」「同一張票連續兩次以 owner is null 認領只有第一次成功」「service_role 不能硬刪」「anon 不能讀」，`npm run test:db` 全綠。

## 2. 權限與狀態規則

- [x] 2.1 （spec「Role-based page access」）`platform/lib/auth/access.ts` 的 `Area` 加 `tickets`：admin、member 可用，finance_partner 不可用。驗證：更新 `platform/lib/auth/access.test.ts` 的權限表測試，`npm run test` 通過。
- [x] 2.2 （spec「Ticket status transitions」）新增 `platform/lib/tickets/flow.ts` 的 `planTransition`，照 spec「Ticket status transitions」的動作表回傳期望狀態、期望認領人、要改的欄位與事件，或中文拒絕原因；退回與不做的原因為空時拒絕；admin 可驗收自己做的票。驗證：新增 `platform/lib/tickets/flow.test.ts`，逐列測動作表的允許與拒絕（含 spec 的四個情境），`npm run test` 通過。
- [x] 2.3 （spec「Kickoff prompt」）新增 `platform/lib/tickets/kickoff.ts` 的 `kickoffText`，內容照 design「開工指令只指路」的 8 點。驗證：新增 `platform/lib/tickets/kickoff.test.ts`，斷言包含 `T-9`、標題、`COLLABORATION.md`、`feat/T-9-`、`fix(T-9)`、`/tickets?t=9`、描述全文，且不包含 `db:migrate`、`.env.local`、`SUPABASE_`、`git add`；先故意在模板加入 `git add` 確認反向測試會紅、再移除。

## 3. 開發頁面

- [x] 3.1 （spec「Conflict-safe claiming」「Ticket history」）新增 `platform/lib/tickets/data.ts`（列出票、讀單張票與歷史，附回報人與認領人名稱）與 `platform/app/(app)/tickets/actions.ts`（開票、編輯、各狀態動作）：每個 action 先 `requireAction("tickets")`，讀票後呼叫 `planTransition`，再以 `db.rpc("dev_ticket_apply")` 寫入；回傳 null 時回「這張票剛被改過」並附目前認領人名稱。[after: 1.1, 2.1, 2.2] 驗證：本機開發庫手動操作確認 actions 行為；`npm run typecheck` 通過。
- [x] 3.2 （spec「Ticket board page」「Description template」「Ticket record」）新增 `platform/app/(app)/tickets/page.tsx` 與開發頁元件：進行中／已結案分頁、只看我的篩選、卡片欄位、`?t=<n>` 票頁（輪到誰與下一步、只顯示有權限的按鈕、描述、由舊到新的歷史）、發布表單預填四段描述、退回與不做必填原因、錯誤以中文顯示；樣式只用 `globals.css` 既有 token 與元件 class，符合 `brand-design-system`。[after: 3.1] 驗證：本機用 `dev-admin`、`dev-member` 走完 開票→認領→交付→退回（需原因）→交付→驗收，`dev-finance` 開 `/tickets` 被導回財務首頁；附桌機與手機寬度截圖。
- [x] 3.3 （spec「Kickoff prompt」）票頁加「複製開工指令」按鈕，只給認領人與 admin，內容來自 `kickoffText`，複製失敗時改為選取文字。[after: 2.3, 3.2] 驗證：本機以認領人身分按下後貼上，內容符合 2.3 的斷言；非認領人的 member 看不到按鈕。
- [x] 3.4 （spec「Icon navigation」；design「入口只放電腦版左側欄」）`platform/components/bottom-nav.tsx` 加「開發」頁（新增票券線條圖示到 `platform/components/icons.tsx`），只在電腦版左側欄顯示（`desk-only`），只給 admin、member。[after: 2.1] 驗證：本機 1280px 寬看得到、390px 寬底部導覽看不到；`dev-finance` 看不到。

## 4. 本機開發環境

- [x] 4.1 （spec「Development sign-in shortcut」）新增 `platform/lib/auth/dev-login.ts` 的 `devLoginEnabled(env)` 與 `platform/app/api/dev/login/route.ts`：三個條件都成立才簽 session 並導向安全路徑，其他一律 404；不存在或未核准的使用者拒絕。驗證：新增 `platform/lib/auth/dev-login.test.ts` 覆蓋 spec 範例表四列；本機 `curl` 在 `DEV_LOGIN` 未設時回 404。
- [x] 4.2 （spec「Development seed data」）新增 `platform/scripts/seed-dev.mts` 與 `package.json` 的 `db:seed-dev` 指令：只在 `JK_ENV=development` 時 upsert `dev-admin`、`dev-member`、`dev-finance` 三個已核准使用者與兩張範例票，從不刪資料；條件不符時印出原因並以非零碼結束。[after: 1.1] 驗證：沒有 `JK_ENV` 時執行回非零碼且資料庫無變化；對本機測試庫連跑兩次，每個種子 id 只有一列。
- [x] 4.3 新增 `platform/.env.example`：列出平台讀取的所有環境變數（含 `JK_ENV`、`DEV_LOGIN`），值留空並附中文說明。驗證：以 `grep -rhoE "process\.env\.[A-Z_]+"` 掃 `platform/app`、`platform/lib`、`platform/scripts` 得到的變數名稱都出現在 `.env.example`。

## 5. 開發規範

- [x] 5.1 （spec「Collaboration guide」）新增 repo 根目錄 `COLLABORATION.md`：程式在哪（`jokesonme-studio`、小組 `dev`）、絕對不做的事、建立開發環境的步驟（另開 Supabase 專案、複製 `.env.example`、`db:migrate`、`db:seed-dev`、假帳號登入網址）、分支與 commit、何時寫 Spectra 提案、開 PR 前自檢（`npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint`）、PR 清單、遵守 `brand-design-system`、開發頁的交付流程。[after: 4.1, 4.2, 4.3] 驗證：內容逐項對照 spec「Collaboration guide」；`kickoff.test.ts` 加一條測試確認 `COLLABORATION.md` 存在。

## 6. 收尾

- [x] 6.1 全部自檢。[after: 3.3, 3.4, 5.1] 驗證：`npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint` 都通過，結果寫進檔案再看退出碼。
