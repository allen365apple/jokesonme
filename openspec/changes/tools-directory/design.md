## Context

工具清單目前在 GitHub Pages 的「看我笑話工具箱」首頁（`jokes-on-me/index.html`），背後是一份要輸密碼的 Google 試算表。平台是 Next.js on Cloudflare Workers，資料在 Supabase，只在伺服器端用 `lib/supabase.ts` 的 `db(actor)` 存取；權限統一走 `lib/auth/access.ts`（頁面 `requirePage`、server action `requireAction`）。導覽在 `components/bottom-nav.tsx` 的 `ITEMS`，「開發」已用 `deskOnly` 只在電腦版側欄出現。

2026-11-19 柏文試用後追加：區塊要能在「編輯」狀態下改名、新增、刪除、調順序；區塊與區塊內工具的排序改成拖曳；預設順序改成現場演出工具、團隊內部工具、其他。`0020_tools.sql` 尚未合併，直接改寫。

## Goals / Non-Goals

**Goals:**

- 團員在平台內看到完整工具目錄，點了就開工具。
- 團員不用開試算表，直接在 `/tools` 新增、編輯、下架與復原工具，並管理區塊（改名、新增、刪除）。
- 區塊與區塊內工具用拖曳排序，鍵盤也能排。
- 第一版資料隨 migration 一起進正式庫，合併部署後不用再手動輸入。

**Non-Goals:**

- 不搬工具本體、不改工具網址；現場投票前端搬家是 T-21。
- 不同步 GitHub Pages 工具箱首頁或 Google 試算表。
- 不做跨區塊拖曳（換區塊在工具的編輯表單裡改）、圖片圖示、硬刪除。
- 不新增相依套件（拖曳與 emoji 選擇器都自己做）。

## Decisions

### Tools table with soft delete

表 `tools`：`id uuid`、`section_id uuid`（參照 `tool_sections`）、`icon text`（1–8 字元）、`name text`（1–40 字）、`description text`（0–120 字）、`url text`（檢查 `^https?://`）、`position int`（同區排序，小的在前）、`archived_at timestamptz`（null＝上架中）、`created_by text`、`created_at`、`updated_at`。RLS 開、不加 policy、收回 public／anon／authenticated，`service_role` 只給 select／insert／update，`select attach_audit('tools')`。下架＝寫 `archived_at`，復原＝清空，不給 DELETE。
替代方案：沿用試算表或存 JSON 在 `app_settings`——前者要密碼、後者無法稽核單筆修改，都不選。
Supersedes：原本的 `section text`（`internal`／`live`／`other` 白名單）改成 `section_id`，見「Managed sections table」。

### Managed sections table

新表 `tool_sections`：`id uuid`、`name text`（修剪後 1–20 字）、`position int`、`archived_at timestamptz`（null＝使用中；刪除區塊＝寫入時間）、`created_by`、`created_at`、`updated_at`。權限與 `tools` 相同（RLS 無 policy、只給 service_role select／insert／update、`attach_audit('tool_sections')`、不給 DELETE）。刪除規則在 `lib/tools.ts` 的資料函式裡檢查：區塊內還有上架中的工具→拒絕；是最後一個使用中的區塊→拒絕；已下架的工具不擋刪除。
替代方案：區塊名稱存在 `app_settings` 的 JSON——無法讓工具用外鍵參照、也無法單筆稽核，不選。

### Atomic full-order reorder functions

Supersedes「Atomic reorder function tools_move」：拖曳一次可能跨好幾格，改成送整份順序。
- `tools_reorder(p_section uuid, p_ids uuid[])`：鎖住該區上架中的工具；`p_ids` 的集合必須與目前該區上架中的 id 完全相同（數量與內容），否則 `raise exception 'stale order'`；相同就依陣列順序把 `position` 設成 1..n，同一交易。
- `tool_sections_reorder(p_ids uuid[])`：同樣規則，對象是使用中的區塊。
- 兩支函式都收回 public 的 execute、只授權 `service_role`。`tools_move` 與其測試移除。
替代方案：一次送單筆的上／下移——拖曳跨多格要送很多次，中途失敗會留下半套順序，不選。

### Seed ten tools in the migration

`0020_tools.sql` 先建三個區塊（position 1 現場演出工具、2 團隊內部工具、3 其他），再 insert 第一版 10 筆工具（來源：`jokes-on-me/index.html` 工具箱卡片，相對網址補成 `https://allen365apple.github.io/jokes-on-me/...` 絕對網址；「看笑內部系統」「收支／財務記錄」兩張指回平台本身、「陪伴動物心理測驗」柏文決定不列）。現場投票的說明寫現在的隊名（攻隊對受隊）。`created_by` 記 `system:seed`。

### Tools area in access matrix

`Area` 新增 `"tools"`：`admin`、`member` 有；`finance_partner` 沒有。頁面 `requirePage("tools", "/tools")`、寫入 `requireAction("tools")`。

### Pure validation in lib/tools.ts

`validateToolInput(raw)` 是純函式：修剪空白、檢查欄位長度、區塊 id 是 uuid 格式、網址必須能被 `new URL()` 解析且 protocol 是 `http:` 或 `https:`；回傳 `{ ok: true, value }` 或 `{ ok: false, error: "<白話中文>" }`。區塊是否存在且未刪除由資料函式在寫入前查資料庫確認。`validateSectionName(raw)` 檢查區塊名稱 1–20 字。server action 與資料庫 check 雙重把關。

### Inline emoji picker without new dependency

表單的圖示欄旁加「選圖示」按鈕，按下在表單內展開（按鈕帶 `aria-expanded`／`aria-controls`），不另開彈出層，因為表單本身已是彈出的 sheet。emoji 清單是 `platform/lib/emoji-list.ts` 手寫的常用清單（約 270 個，分組、附中文關鍵字），搜尋是同檔的純函式 `searchEmoji`。
替代方案：引入開源套件 `emojibase-data`（約 1,900 個、官方繁中關鍵字）——要新增相依套件，柏文決定先用手寫版。

### Pointer-based drag with keyboard fallback

拖曳自己用 pointer events 做（可同時支援滑鼠、觸控筆、觸控），不用 HTML5 原生拖放（手機觸控不能用），也不加套件。做法依 modern-web-guidance 的 `drag-and-drop` 指南：
- 只從把手拖：把手是 `<button>`，`touch-action: none`、`user-select: none`（含 `-webkit-`）、`cursor: grab`；拖曳中在根元素加 class 讓游標維持 `grabbing`。
- `pointerdown` 只認主要按鍵，`setPointerCapture`，記住 `pointerId`，其他指標的事件一律忽略。
- 拖曳中被拖的項目跟著指標 `translate`、稍微放大加陰影，其他項目不動；落點用一條落點線表示（`position: fixed`，用前後項目的 `getBoundingClientRect()` 算位置），落點等於原位時不顯示。
- 落點用版面中點計算（`offsetTop + offsetHeight / 2`），不用 `event.target`。
- 放開時更新 React state 的順序（不直接搬 DOM），再呼叫 server action 送整份順序；失敗就把 state 還原並顯示錯誤。`Escape` 取消拖曳。
- 拖曳只沿垂直方向：編輯模式下工具改成單欄（平常仍是兩欄），區塊本來就是單欄。
- 鍵盤：把手聚焦後 `ArrowUp`／`ArrowDown` 移一格，焦點留在把手上，並用 `aria-live="polite"` 區域唸出「已移到第 n 個」。把手的 `aria-label` 寫出項目名稱與「拖曳或用上下鍵調整順序」。
- 尊重 `prefers-reduced-motion`：減少動態時不做位移動畫。
替代方案：保留上移／下移按鈕——柏文明確要求改成拖曳；鍵盤需求由把手的方向鍵滿足。

### Desktop-only toolbox nav item

`ITEMS` 在「開發」後新增 `{ href: "/tools", label: "工具箱", Icon: IconToolbox, areas: ["admin","member"], deskOnly: true }`。`IconToolbox` 照既有 icon 的線條風格（同 stroke 寬度、`currentColor`）新增。

## Implementation Contract

**Behavior**
- 電腦版（≥900px）側欄對 admin、member 多一個「工具箱」，點了進 `/tools`；390px 底部導覽沒有它，但直接開 `/tools` 可用。
- `/tools` 依 `tool_sections.position` 顯示使用中的區塊（預設：現場演出工具、團隊內部工具、其他），區塊內依工具 `position` 排卡片；卡片顯示圖示、名稱、說明，是 `<a target="_blank" rel="noopener noreferrer">`。平常沒有工具的區塊不顯示；手機一欄、900px 以上兩欄。
- 頁首有「新增工具」與「編輯」開關。平常只看區塊標題與卡片；按「編輯」（按鈕變「完成」）後：
  - 每個區塊標題旁出現拖曳把手、改名、刪除（刪不了時顯示白話原因）；所有使用中的區塊都顯示，包括空的；區塊清單最後有「新增區塊」。
  - 每張卡出現拖曳把手、編輯、右上角下架叉叉；工具改成單欄。
  - 頁面底部出現收合的「已下架（n）」清單，每筆有「復原」。
  - 所有控制項滑鼠移上去或鍵盤聚焦時立刻顯示說明（`.tool-btn` 的 `data-tip`）。
- 新增工具與改區塊時排到該區最後；復原時排到原區塊最後，原區塊已刪除就排到第一個區塊最後。新增區塊排到最後。
- 拖曳放開或方向鍵移動後畫面立即更新，背景存檔；失敗還原並顯示訊息。
- 寫入成功後 `revalidatePath("/tools")`，重新整理後仍在。

**Interface / data shape**
- `lib/tools.ts`：`type ToolSection = { id, name, position }`；`type Tool = { id, sectionId, icon, name, description, url, position, archivedAt: string | null }`；`validateToolInput(raw)`、`validateSectionName(raw)`；資料函式 `listToolbox(actor): { sections: ToolSection[]; tools: Tool[] }`、`createTool`、`updateTool`、`archiveTool`、`restoreTool`、`reorderTools(actor, sectionId, ids)`、`createSection(actor, name)`、`renameSection(actor, id, name)`、`deleteSection(actor, id)`、`reorderSections(actor, ids)`，全部經 `db(actor)`；`reorderTools`／`reorderSections` 在順序過期時回傳可辨識的結果（例如 `"stale"`）。
- `app/(app)/tools/actions.ts`：上述寫入各一個 server action，收 `FormData`（排序用 JSON 字串陣列），回 `{ ok: true } | { ok: false; error: string }`。
- 資料庫：表 `tools`、`tool_sections`；函式 `tools_reorder(uuid, uuid[])`、`tool_sections_reorder(uuid[])`。

**Failure modes**
- 驗證失敗：表單下方顯示白話錯誤（例：「網址要用 http:// 或 https:// 開頭」「名稱請填 1 到 40 個字」「區塊名稱請填 1 到 20 個字」），不寫入。
- 區塊已被刪：「這個區塊已經不在了，請重新整理後再選」。
- 刪除區塊被擋：「區塊裡還有工具，先把工具移走或下架再刪除」、「至少要留一個區塊」。
- 排序過期：「清單已經被別人改過，請重新整理後再排」，畫面還原。
- 權限不足：finance_partner 開 `/tools` 被導回財務首頁；直接呼叫 action 回「你沒有工具箱的權限」，不寫入。未登入開 `/tools` 被導去登入頁。
- 其他資料庫錯誤：「存檔失敗，請稍後再試」，不顯示技術錯誤。

**Acceptance criteria**
- `npm run test`：`lib/tools.test.ts` 覆蓋網址、長度、區塊 id 格式、區塊名稱邊界；`lib/auth/access.test.ts` 覆蓋三種角色對 `tools` 的結果；若把拖曳的落點計算或陣列搬移寫成純函式，附單元測試。
- `npm run test:db`：`supabase/test/tools.test.sql` 驗證：種子 3 個區塊的順序與 10 個工具（6／3／1）；非 http(s) 網址被 check 擋；`tools_reorder` 套用整份順序、id 集合不符（少一個、多一個、含已下架、含別區）時拒絕且不改任何 position；`tool_sections_reorder` 同理；兩支函式只有 service_role 能執行；兩張表 anon／authenticated 無權讀寫、沒有 DELETE 權限；寫入有稽核紀錄。
- `npm run typecheck`、`npm run lint` 通過。
- 本機瀏覽器：1280px 與 390px 各拖一次區塊與工具，重新整理後順序還在；用方向鍵各移一次；新增、改名、刪除區塊（含兩種被擋的情況）；新增工具選新區塊；下架後刪區塊再復原，工具落到第一個區塊最後；以 `dev-finance`、未登入各開一次 `/tools`。觸控拖曳在預覽工具裡無法真實模擬，交給柏文用手機或 Edge 裝置模擬確認。

**Scope boundaries**
- In scope：上述表、函式、頁面、action、權限區域、導覽項、icon、emoji 選擇器、拖曳與鍵盤排序、測試。
- Out of scope：跨區塊拖曳、T-21 投票前端、GitHub Pages 工具箱首頁、Google 試算表、其他頁面的版面。

## Risks / Trade-offs

- [平台與 GitHub Pages 兩份清單會分歧] → 票上已註明暫時各自維護；之後若要以平台為準，另開票讓 GitHub Pages 讀平台資料或導過來。
- [種子資料裡有網址目前打不開：社群素材產生器 `https://jessechen-humanoid.github.io/jokesonme-post/` 實測回 404] → 照原清單放入，PR 已列給傑哥；上線後也能直接在頁面上改。
- [團員都能改所有工具與區塊，誤改無法一鍵還原] → `attach_audit` 留下每次修改的紀錄；下架與刪除區塊都是軟刪除。
- [自製拖曳在觸控裝置的手感] → 依指南只從把手拖、`touch-action: none` 只套在把手；本機只能驗滑鼠，觸控請柏文實機確認。

## Migration Plan

- 合併後由 Jesse 對正式庫跑 `npm run db:migrate`，會建立 `tool_sections`、`tools` 並放入 3 個區塊與 10 個工具。
- 已套用舊版 0020 的本機開發庫要先手動移除舊表與 `_migrations` 中 0020 的紀錄再重跑（只影響本機假資料）。
- 回滾：撤掉 nav 項與頁面即可；兩張表留著不影響其他功能。

## Open Questions

- 社群素材產生器的正確網址（目前 404），待柏文或傑哥確認。
