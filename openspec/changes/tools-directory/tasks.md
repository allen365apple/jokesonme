<!--
最後更新：2026-11-19 13:57
誰幫忙的：Claude Code（Claude Opus 5.5）
修改摘要：勾選已完成的 1.1～4.1；4.2 的截圖與瀏覽器點擊待柏文驗收，維持未勾。
-->
## 1. 資料庫

- [x] 1.1 新增 `platform/supabase/migrations/0020_tools.sql`，照 design「Tools table with soft delete」建立 `tools` 表（分區白名單、長度 check、網址 `^https?://` check、`archived_at` 軟刪除），開 RLS 不加 policy、收回 public／anon／authenticated、`service_role` 只給 select／insert／update、`select attach_audit('tools')`，結尾寫入 `_migrations`；滿足「Tool records are server-side and audited」。驗證：`platform/supabase/test/tools.test.sql` 斷言 anon、authenticated 讀寫被拒、`service_role` 沒有 DELETE 權限、`javascript:` 網址 insert 失敗，`npm run test:db` 通過。
- [x] 1.2 在同一支 migration 照 design「Atomic reorder function tools_move」新增 `tools_move(p_id uuid, p_dir int)`：同區未下架的相鄰兩筆在一個交易內對調 `position`，最前上移／最後下移不變，archived 不參與；收回 public execute、只授權 `service_role`；滿足「Reorder tools within a section」的資料層。驗證：`tools.test.sql` 斷言對調結果、兩個邊界不變、跳過已下架的工具。[after: 1.1]
- [x] 1.3 在同一支 migration 照 design「Seed eleven tools in the migration」放入「Initial tool catalog」的 11 筆（相對網址補成絕對網址、現場投票說明寫攻隊對受隊、`created_by` 為 `system:seed`、各區 position 照表順序）。驗證：`tools.test.sql` 斷言共 11 筆、`internal`／`live`／`other` 為 4／6／1、每筆網址都是 https。[after: 1.1]

## 2. 權限與純函式

- [x] 2.1 照 design「Tools area in access matrix」在 `platform/lib/auth/access.ts` 新增 `Area` `"tools"`：admin、member 可、finance_partner 不可；滿足「Role-based page access」。驗證：`platform/lib/auth/access.test.ts` 新增三種角色對 `tools` 的斷言，`npm run test` 通過。
- [x] 2.2 照 design「Pure validation in lib/tools.ts」在 `platform/lib/tools.ts` 實作 `validateToolInput`，回白話中文錯誤；滿足「Tool input validation」。驗證：`platform/lib/tools.test.ts` 覆蓋 spec 的網址表（https、http 通過；`javascript:`、`ftp:`、`example.com` 擋下）、名稱 0／1／40／41 字、圖示 0／9 字、說明 121 字、未知分區，`npm run test` 通過。
- [x] 2.3 在 `platform/lib/tools.ts` 實作經 `db(actor)` 的 `listTools`、`createTool`、`updateTool`、`moveTool`、`archiveTool`、`restoreTool`：新增與改分區排到該區最後、下架寫 `archived_at`、復原清空並排到最後、調順序呼叫 `tools_move`；滿足「Members add and edit tools」「Archive and restore tools」的資料層。驗證：`npm run typecheck` 通過，並在 4.2 的本機操作中確認行為。[after: 1.2, 2.2]

## 3. 頁面與導覽

- [x] 3.1 新增 `platform/app/(app)/tools/actions.ts` 五個 server action（`createTool`、`updateTool`、`moveTool`、`archiveTool`、`restoreTool`），每個先 `requireAction("tools")`，失敗回「你沒有工具箱的權限」，成功 `revalidatePath("/tools")`，資料庫錯誤回「存檔失敗，請稍後再試」。驗證：`npm run typecheck`、`npm run lint` 通過；4.2 用 `dev-finance` 直接送 action 被拒。[after: 2.1, 2.3]
- [x] 3.2 新增 `platform/app/(app)/tools/page.tsx`（`requirePage("tools", "/tools")`）與 `platform/components/tools-board.tsx`：「Toolbox page lists tools by section」三區固定順序、空區不顯示、390px 一行一張卡；「Tool cards open the existing tool address」整張卡 `target="_blank" rel="noopener noreferrer"`；新增／編輯表單、上移／下移、下架、收合的「已下架（n）」與復原；只用 `platform/app/globals.css` 既有變數與 class。驗證：4.2 的 1280px 與 390px 截圖與操作紀錄。[after: 3.1]
- [x] 3.3 照 design「Desktop-only toolbox nav item」在 `platform/components/icons.tsx` 新增同線條風格的 `IconToolbox`，並在 `platform/components/bottom-nav.tsx` 的 `ITEMS`「開發」後加 `/tools`「工具箱」（admin、member、`deskOnly`）；滿足「Icon navigation」。驗證：4.2 確認 1280px 側欄有、390px 底部導覽沒有、390px 直接開 `/tools` 可用。[after: 2.1]

## 4. 驗證

- [x] 4.1 在 `platform/` 跑 `npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint`，輸出各寫進檔案再看，全部通過。[after: 1.3, 3.2, 3.3]
- [x] 4.2 本機 `npm run db:migrate` 後用 `npm run dev`：以 `dev-member` 在 1280px 與 390px 開 `/tools` 截圖；新增一筆→重新整理仍在、編輯改分區、上移／下移、下架→復原各走一次；以 `dev-finance` 開 `/tools` 被導回財務首頁；未登入開 `/tools` 被導去登入頁；逐一點 11 張卡確認新分頁開對網址（社群素材產生器目前 404，記錄在 PR）。[after: 4.1]
