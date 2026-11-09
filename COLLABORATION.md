# 看我笑話平台開發規範

這份是看我笑話平台（`platform/`）唯一的開發規矩。人和 Claude 都照這份做；「開發」頁的「開工指令」只會叫你來讀這份，不會重複寫規矩。規矩改了就改這份。

## 零、接一張票的最短路徑

1. 到平台的「開發」頁（電腦版左側欄，或直接開 `/tickets`）認領一張票，按「複製開工指令」貼給 Claude。
2. Claude 從最新的 `main` 開分支 `feat/T-<票號>-<短名>`。
3. 照「四、要不要寫 Spectra 提案」決定要不要先寫提案。
4. 改好、跑完「五、開 PR 前自檢」，先停下來給操作的人看效果，確認後才 push、開 PR。
5. PR 標題 `fix(T-<票號>): <一句話說明>`，請 Jesse 審。**不要自己合併。**
6. Jesse 合併並部署後，回到票頁按「交付」，交給開票的人驗收。

## 一、絕對不可以做的事

1. **不要 push `main`。** 一律開分支、開 PR。
2. **不要自己合併 PR。** 合併是 Jesse 的事。
3. **不要碰正式環境。** 不拿、不要求、不貼正式的金鑰；不對正式資料庫下任何指令；不跑 `npm run cf:build`、`npm run cf:deploy`。部署與正式資料庫的 migration 只有 Jesse 做。
4. **不要把真實資料放進 repo、PR、截圖或聊天。** 粉絲個資、財務原始檔只放 `RAW DATA/`（不進版控）；要舉例就用假資料。
5. **不要用 `git add -A` 或 `git add .`。** 只加這次改到的檔，避免把 `.env.local` 或別的檔帶進去。

## 二、要 Jesse 本人做的事

- 邀請你進 GitHub 組織 `jokesonme-studio` 的小組 `dev`（有 `jokesonme` repo 的寫入權限）。
- 建立開發用的 Supabase 專案，把開發用的值給你（見下一節）。
- 合併 PR、部署、對正式資料庫跑 migration。
- 平台的成員核准與角色設定。

## 三、建立開發環境（第一次）

需要：Node.js、Git、本機 PostgreSQL（`psql`、`createdb`，Mac 用 `brew install postgresql` 安裝）。

1. `git clone https://github.com/jokesonme-studio/jokesonme.git`，進到 `platform/` 跑 `npm install`。
2. 複製 `platform/.env.example` 成 `platform/.env.local`，照裡面的說明填**開發用** Supabase 專案的值，另外填：
   - `JK_ENV=development`
   - `DEV_LOGIN=1`
   - `AUTH_SECRET`、`CRON_SECRET`：自己產生，例如 `openssl rand -hex 32`
3. 在 `platform/` 跑 `npm run db:migrate`，把資料表建到開發用資料庫。
4. 跑 `npm run db:seed-dev`，放入假帳號 `dev-admin`（管理員）、`dev-member`（成員）、`dev-finance`（財務夥伴）與兩張範例票。這個指令看不到 `JK_ENV=development` 會拒絕執行。
5. 跑 `npm run dev`，打開 `http://localhost:3000/api/dev/login?as=dev-member&next=/tickets` 就會以 `dev-member` 登入。要換身分就把 `as=` 換成別的假帳號。

假帳號登入只在本機、`DEV_LOGIN=1` 而且 `JK_ENV=development` 時存在，正式網站永遠是 404。本機開發不需要 LINE 頻道；要測 LINE 登入或機器人，請 Jesse 另外開開發用頻道。

## 四、工作流程

### 分支與 commit

- 分支：接票的工作用 `feat/T-<票號>-<短名>`；沒有票的小修也要開 `feat/<短名>` 或 `fix/<短名>`。
- commit 訊息用中文，寫清楚改了什麼、為什麼。
- 只 `git add` 這次改到的檔。

### 要不要寫 Spectra 提案

這個 repo 用 Spectra 管規格：`openspec/specs/` 是規格的唯一來源，規格和程式衝突時以規格為準。

- **要先用 `/spectra-propose` 寫提案**：新功能、新頁面、動到資料庫（新增或修改 migration）、動到權限或登入、改變既有規格寫的行為。
- **可以不寫提案**：修錯字、調整文字、修一個明顯的 bug 而且不改變規格寫的行為、只改樣式。
- 拿不準就寫提案，或先問 Jesse。

### 開 PR 前自檢

在 `platform/` 跑以下四個，全部通過才開 PR。輸出寫進檔案再看結果，不要接 `| tail` 之類的管線（會吃掉失敗的退出碼）：

- `npm run test`：單元測試
- `npm run test:db`：資料庫測試（只動本機的 `jokesonme_test`，不碰任何 Supabase）
- `npm run typecheck`
- `npm run lint`

### PR 清單

開 PR 時在內文逐項確認：

- [ ] 分支已合進最新的 `main`
- [ ] 四項自檢都通過
- [ ] 有改畫面的話，附電腦版與手機版（390px 寬）改動前後截圖，截圖用假資料
- [ ] 有新 migration 的話，寫明檔名，並提醒 Jesse 合併後要對正式庫跑 `npm run db:migrate`
- [ ] 有寫 Spectra 提案的話，附提案名稱
- [ ] 重讀一次票的描述，確認驗收條件都做到了

請 Jesse（GitHub 帳號 `jessechen-humanoid`）審。收到修改意見就在同一條分支改完再 push，不要開新 PR。

## 五、寫程式的硬規矩

- **資料庫只在伺服器端碰。** 一律用 `lib/supabase.ts` 的 `db(actor)`，actor 帶操作的人（`user:<LINE userId>`），資料庫的操作紀錄才記得到是誰改的。金鑰絕不能送到瀏覽器。
- **權限統一走 `lib/auth/access.ts`。** 頁面用 `requirePage(area, path)`，server action 用 `requireAction(area)`；不能只靠隱藏按鈕。
- **migration 規則**：
  - 檔名接續編號：`platform/supabase/migrations/00NN_<名稱>.sql`，結尾寫入 `_migrations`。
  - 新表一律 RLS 開啟、不加 policy，收回 public／anon／authenticated 的權限，只給 `service_role` 需要的權限，並 `select attach_audit('<表名>')`。
  - 不給 DELETE：要刪就用軟刪除欄位或狀態。
  - 新的資料庫函式要收回 public 的 execute、只授權 `service_role`。
  - 每支 migration 在 `platform/supabase/test/` 有對應的測試，`npm run test:db` 要通過。
- **畫面照品牌設計系統。** 規格在 `openspec/specs/brand-design-system/`，顏色、字級、圓角只用 `platform/app/globals.css` 既有的 CSS 變數與 class，不自己加新顏色。手機優先，電腦版（900px 以上）再加寬。
- **畫面上的字用白話中文**，錯誤訊息講清楚發生什麼、使用者要怎麼做，不顯示技術錯誤。
- **測試**：純函式放 `lib/`，旁邊放 `*.test.ts`（`node:test`）。修 bug 先寫一個會重現 bug 的測試，確認它會紅，再修到綠。

## 六、票怎麼走

| 狀態 | 意思 | 誰要動作 |
| --- | --- | --- |
| 待處理 | 開好了，等人認領 | 想做的人按「認領」 |
| 處理中 | 有人在做 | 認領人開發；PR 合併部署後按「交付」 |
| 待驗收 | 做完了 | 開票的人驗收：通過按「驗收通過」，有問題按「退回」並寫原因 |
| 已完成 | 驗收通過 | — |
| 不做 | 決定不做（要寫原因） | 管理員可以重新開放 |

- 認領人不能驗收自己做的票；開票的人自己做的票由管理員驗收。
- 做不下去就按「取消認領」，把票放回去給別人。
- 開票時照四段寫：現在怎樣、希望變成、做完看得到什麼（驗收）、誰會用、誰看得到。寫得越清楚，接手的人和 Claude 越不會做錯。

## 七、用 Claude 開票、操作票

裝了看我笑話外掛之後，可以在任何資料夾請 Claude 開票、查票、認領、交付、驗收、退回、標不做，規則跟網頁一樣，票記在你本人名下。編輯票、重新開放「不做」的票只能在網頁上做。

1. **安裝外掛（每台電腦一次）**：在 Claude Code 或桌面 App 的 Code 分頁輸入下面兩行，各按一次 Enter，再重新開啟 Claude。
   - `/plugin marketplace add jokesonme-studio/jokesonme-plugins`
   - `/plugin install jokesonme@jokesonme`
2. **連結帳號**：平台「我的」→「連結 Claude」→「產生連結碼」，把那句「連結看我笑話，代碼 jk_link_…」貼給 Claude。連結碼 10 分鐘內有效、只能用一次。
3. **撤銷**：不用了或電腦遺失，到同一個地方按「撤銷」，那台電腦立刻失效。

開票前 Claude 會先問清楚四段、查有沒有重複，把草稿列給你確認，你說好才開。連結用的金鑰只能操作開發頁，碰不到財務等其他資料。

外掛的程式在 `jokesonme-studio/jokesonme-plugins`；平台這邊的 API 在 `platform/app/api/claude/`，規格是 `openspec/specs/claude-ticket-tools/`（封存後）。改了 API 的參數或回傳格式，要在同一次改動裡一起改外掛，並把 `platform/lib/claude/tokens.ts` 的 `API_VERSION` 加一。
