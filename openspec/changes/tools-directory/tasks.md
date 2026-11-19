<!--
最後更新：2026-11-19 15:09
誰幫忙的：Claude Code（Claude Opus 5.5）
修改摘要：完成追加需求的 5.1～5.4 與 6.1（區塊資料表與整份排序函式、區塊管理、拖曳與鍵盤排序、四項自檢）；6.2 瀏覽器驗收待柏文。
-->
## 1. 資料庫

- [x] 1.1 新增 `platform/supabase/migrations/0020_tools.sql`，照 design「Tools table with soft delete」建立 `tools` 表（分區白名單、長度 check、網址 `^https?://` check、`archived_at` 軟刪除），開 RLS 不加 policy、收回 public／anon／authenticated、`service_role` 只給 select／insert／update、`select attach_audit('tools')`，結尾寫入 `_migrations`；滿足「Tool records are server-side and audited」。驗證：`platform/supabase/test/tools.test.sql` 斷言 anon、authenticated 讀寫被拒、`service_role` 沒有 DELETE 權限、`javascript:` 網址 insert 失敗，`npm run test:db` 通過。
- [x] 1.2 在同一支 migration 照 design「Atomic reorder function tools_move」新增 `tools_move(p_id uuid, p_dir int)`：同區未下架的相鄰兩筆在一個交易內對調 `position`，最前上移／最後下移不變，archived 不參與；收回 public execute、只授權 `service_role`；滿足「Reorder tools within a section」的資料層。驗證：`tools.test.sql` 斷言對調結果、兩個邊界不變、跳過已下架的工具。[after: 1.1]
- [x] 1.3 在同一支 migration 照 design「Seed ten tools in the migration」放入「Initial tool catalog」的 10 筆（相對網址補成絕對網址、現場投票說明寫攻隊對受隊、`created_by` 為 `system:seed`、各區 position 照表順序）。驗證：`tools.test.sql` 斷言共 10 筆、`internal`／`live`／`other` 為 3／6／1、每筆網址都是 https。[after: 1.1]

## 2. 權限與純函式

- [x] 2.1 照 design「Tools area in access matrix」在 `platform/lib/auth/access.ts` 新增 `Area` `"tools"`：admin、member 可、finance_partner 不可；滿足「Role-based page access」。驗證：`platform/lib/auth/access.test.ts` 新增三種角色對 `tools` 的斷言，`npm run test` 通過。
- [x] 2.2 照 design「Pure validation in lib/tools.ts」在 `platform/lib/tools.ts` 實作 `validateToolInput`，回白話中文錯誤；滿足「Tool input validation」。驗證：`platform/lib/tools.test.ts` 覆蓋 spec 的網址表（https、http 通過；`javascript:`、`ftp:`、`example.com` 擋下）、名稱 0／1／40／41 字、圖示 0／9 字、說明 121 字、未知分區，`npm run test` 通過。
- [x] 2.3 在 `platform/lib/tools.ts` 實作經 `db(actor)` 的 `listTools`、`createTool`、`updateTool`、`moveTool`、`archiveTool`、`restoreTool`：新增與改分區排到該區最後、下架寫 `archived_at`、復原清空並排到最後、調順序呼叫 `tools_move`；滿足「Members add and edit tools」「Archive and restore tools」的資料層。驗證：`npm run typecheck` 通過，並在 4.2 的本機操作中確認行為。[after: 1.2, 2.2]

## 3. 頁面與導覽

- [x] 3.1 新增 `platform/app/(app)/tools/actions.ts` 五個 server action（`createTool`、`updateTool`、`moveTool`、`archiveTool`、`restoreTool`），每個先 `requireAction("tools")`，失敗回「你沒有工具箱的權限」，成功 `revalidatePath("/tools")`，資料庫錯誤回「存檔失敗，請稍後再試」。驗證：`npm run typecheck`、`npm run lint` 通過；4.2 用 `dev-finance` 直接送 action 被拒。[after: 2.1, 2.3]
- [x] 3.2 新增 `platform/app/(app)/tools/page.tsx`（`requirePage("tools", "/tools")`）與 `platform/components/tools-board.tsx`：「Toolbox page lists tools by section」三區固定順序、空區不顯示、390px 一行一張卡；「Tool cards open the existing tool address」整張卡 `target="_blank" rel="noopener noreferrer"`；新增／編輯表單、上移／下移、下架、收合的「已下架（n）」與復原；只用 `platform/app/globals.css` 既有變數與 class。驗證：4.2 的 1280px 與 390px 截圖與操作紀錄。[after: 3.1]
- [x] 3.3 照 design「Desktop-only toolbox nav item」在 `platform/components/icons.tsx` 新增同線條風格的 `IconToolbox`，並在 `platform/components/bottom-nav.tsx` 的 `ITEMS`「開發」後加 `/tools`「工具箱」（admin、member、`deskOnly`）；滿足「Icon navigation」。驗證：4.2 確認 1280px 側欄有、390px 底部導覽沒有、390px 直接開 `/tools` 可用。[after: 2.1]

- [x] 3.4 照 design「Inline emoji picker without new dependency」新增 `platform/lib/emoji-list.ts`（常用 emoji、中文關鍵字、`searchEmoji`）與 `platform/components/emoji-picker.tsx`，表單圖示欄改用它；滿足「Icon picker with search」。驗證：`platform/lib/emoji-list.test.ts`（清單不重複、中文與英文關鍵字、貼上 emoji、無結果），以及本機瀏覽器 1280px／390px 展開、搜尋「麥克風」、點選後欄位填入並收起。[after: 3.2]

## 4. 驗證

- [x] 4.1 在 `platform/` 跑 `npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint`，輸出各寫進檔案再看，全部通過。[after: 1.3, 3.2, 3.3]
- [x] 4.2 本機 `npm run db:migrate` 後用 `npm run dev`：以 `dev-member` 在 1280px 與 390px 開 `/tools` 截圖；新增一筆→重新整理仍在、編輯改分區、上移／下移、下架→復原各走一次；以 `dev-finance` 開 `/tools` 被導回財務首頁；未登入開 `/tools` 被導去登入頁；逐一點全部卡片確認新分頁開對網址（社群素材產生器目前 404，記錄在 PR）。[after: 4.1]

## 5. 區塊管理與拖曳排序（2026-11-19 柏文追加）

> 變更說明（不是待辦）：已完成的 1.1「分區白名單」、1.2 `tools_move`、2.3 `moveTool`、3.1 `moveTool` action、3.2 的上移／下移按鈕被 design「Managed sections table」與「Atomic full-order reorder functions」取代；以下 5.x 是補上新行為並移除舊做法的工作，1.x～4.x 的勾選保留為歷史紀錄。

- [x] 5.1 改寫 `platform/supabase/migrations/0020_tools.sql`：照 design「Managed sections table」新增 `tool_sections`（名稱 1–20 字、position、`archived_at` 軟刪除、RLS 無 policy、只給 service_role select／insert／update、`attach_audit`），`tools.section` 改成 `section_id` 參照它；照「Seed ten tools in the migration」先建區塊（現場演出工具、團隊內部工具、其他）再放 10 個工具；照「Atomic full-order reorder functions」新增 `tools_reorder(uuid, uuid[])` 與 `tool_sections_reorder(uuid[])`、移除 `tools_move`；滿足「Initial tool catalog」「Tool records are server-side and audited」與「Drag to reorder sections and tools」的資料層。驗證：改寫 `platform/supabase/test/tools.test.sql`，斷言區塊順序與 6／3／1、整份順序套用、id 集合不符（少、多、含已下架、含別區）時拒絕且 position 不變、函式只授權 service_role、兩表沒有 DELETE、寫入有稽核，`npm run test:db` 通過。
- [x] 5.2 改寫 `platform/lib/tools.ts`：型別改成 `ToolSection = { id, name, position }`、`Tool.sectionId`；`validateToolInput` 改檢查區塊 id 格式、新增 `validateSectionName`；資料函式 `listToolbox`、`createSection`、`renameSection`、`deleteSection`（上架中工具或最後一個區塊時拒絕、已下架工具不擋）、`reorderSections`、`reorderTools`（順序過期回可辨識結果），建立／編輯工具時確認區塊存在且未刪除，`restoreTool` 在原區塊已刪時放到第一個區塊最後；移除 `moveTool`；滿足「Manage toolbox sections」「Tool input validation」「Archive and restore tools」。驗證：`platform/lib/tools.test.ts` 更新區塊 id 與區塊名稱邊界，`npm run test`、`npm run typecheck` 通過。[after: 5.1]
- [x] 5.3 改寫 `platform/app/(app)/tools/actions.ts` 與 `platform/app/(app)/tools/page.tsx`：新增區塊的新增／改名／刪除／排序與工具排序 action（排序參數為 JSON 字串陣列），全部先 `requireAction("tools")`，錯誤訊息照 design「Failure modes」；移除 `moveTool` action；頁面改讀 `listToolbox`。驗證：`npm run typecheck`、`npm run lint` 通過；6.2 以 `dev-finance` 直接送新 action 被拒。[after: 5.2]
- [x] 5.4 照 design「Pointer-based drag with keyboard fallback」改寫 `platform/components/tools-board.tsx`（必要時拆出拖曳用的元件或純函式）：「Edit mode for the toolbox」編輯模式下區塊與工具都有拖曳把手、工具改單欄、空區塊顯示、區塊改名／刪除／新增區塊；拿掉上移／下移按鈕；拖曳只從把手、落點線、放開才更新、Escape 取消、不跨區塊、失敗還原；把手方向鍵移一格並以 polite live region 播報；表單「放在哪一區」改讀區塊資料；「Toolbox page lists tools by section」平常隱藏空區塊。只用 `platform/app/globals.css` 既有顏色變數。驗證：拖曳落點計算或陣列搬移若為純函式則附單元測試；6.2 的瀏覽器操作紀錄。[after: 5.3]

## 6. 追加需求的驗證

- [x] 6.1 在 `platform/` 跑 `npm run test`、`npm run test:db`、`npm run typecheck`、`npm run lint`，輸出各寫進檔案再看，全部通過。[after: 5.4]
- [ ] 6.2 本機重建開發庫的 0020（先移除舊表與 `_migrations` 紀錄，只動本機）後用 `npm run dev`：1280px 與 390px 各拖一次區塊與工具並重新整理確認；方向鍵各移一次；新增、改名、刪除區塊（含「還有工具」與「最後一個」兩種被擋）；新增工具選新區塊；下架後刪區塊再復原；以 `dev-finance`、未登入各開一次 `/tools`。觸控拖曳交柏文實機確認。[after: 6.1]

