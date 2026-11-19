## Context

工具清單目前在 GitHub Pages 的「看我笑話工具箱」首頁（`jokes-on-me/index.html`），背後是一份要輸密碼的 Google 試算表。平台是 Next.js on Cloudflare Workers，資料在 Supabase，只在伺服器端用 `lib/supabase.ts` 的 `db(actor)` 存取；權限統一走 `lib/auth/access.ts`（頁面 `requirePage`、server action `requireAction`）。導覽在 `components/bottom-nav.tsx` 的 `ITEMS`，「開發」已用 `deskOnly` 只在電腦版側欄出現。

## Goals / Non-Goals

**Goals:**

- 團員在平台內看到完整工具目錄，點了就開工具。
- 團員不用開試算表，直接在 `/tools` 新增、編輯、調順序、下架與復原。
- 第一版資料隨 migration 一起進正式庫，合併部署後不用再手動輸入。

**Non-Goals:**

- 不搬工具本體、不改工具網址；現場投票前端搬家是 T-21。
- 不同步 GitHub Pages 工具箱首頁或 Google 試算表。
- 不做自訂分區、圖片圖示、硬刪除。

## Decisions

### Tools table with soft delete

新表 `tools`：`id uuid`、`section text`（`internal`／`live`／`other`）、`icon text`（1–8 字元，放一個 emoji）、`name text`（1–40 字）、`description text`（0–120 字）、`url text`（檢查 `^https?://`）、`position int`（同區排序，小的在前）、`archived_at timestamptz`（null＝上架中）、`created_by text`、`created_at`、`updated_at`。RLS 開、不加 policy、收回 public／anon／authenticated，`service_role` 只給 select／insert／update，`select attach_audit('tools')`。下架＝寫 `archived_at`，復原＝清空，不給 DELETE。
替代方案：沿用試算表或存 JSON 在 `app_settings`——前者要密碼、後者無法稽核單筆修改，都不選。

### Atomic reorder function tools_move

同區上下調順序用資料庫函式 `tools_move(p_id uuid, p_dir int)`：在同一區、未下架的工具中找到相鄰那一筆，兩筆 `position` 在同一交易對調；已在最前或最後時不變。函式收回 public 的 execute，只授權 `service_role`。
替代方案：在 app 端連續兩次 update——兩人同時調會出現重複 position，不選。

### Seed eleven tools in the migration

`0020_tools.sql` 直接 insert 第一版 11 筆（來源：`jokes-on-me/index.html` 工具箱卡片，相對網址補成 `https://allen365apple.github.io/jokes-on-me/...` 絕對網址；「看笑內部系統」「收支／財務記錄」兩張指回平台本身，不列）。現場投票的說明改成現在的隊名（攻隊對受隊）。`created_by` 記 `system:seed`。

### Tools area in access matrix

`Area` 新增 `"tools"`：`admin`、`member` 有；`finance_partner` 沒有。頁面 `requirePage("tools", "/tools")`、寫入 `requireAction("tools")`。

### Pure validation in lib/tools.ts

`validateToolInput(raw)` 是純函式：修剪空白、檢查欄位長度、分區只能三選一、網址必須能被 `new URL()` 解析且 protocol 是 `http:` 或 `https:`；回傳 `{ ok: true, value }` 或 `{ ok: false, error: "<白話中文>" }`。server action 與資料庫 check 雙重把關。

### Inline emoji picker without new dependency

表單的圖示欄旁加「選圖示」按鈕，按下在表單內展開（按鈕帶 `aria-expanded`／`aria-controls`），不另開彈出層，因為表單本身已是彈出的 sheet。emoji 清單是 `platform/lib/emoji-list.ts` 手寫的常用清單（約 270 個，分組、附中文關鍵字），搜尋是同檔的純函式 `searchEmoji`。
替代方案：引入開源套件 `emojibase-data`（約 1,900 個、官方繁中關鍵字）——要新增相依套件，這次先不加，等柏文與 Jesse 決定；清單沒有的 emoji 可以直接在欄位輸入。

### Desktop-only toolbox nav item

`ITEMS` 在「開發」後新增 `{ href: "/tools", label: "工具箱", Icon: IconToolbox, areas: ["admin","member"], deskOnly: true }`。`IconToolbox` 照既有 icon 的線條風格（同 stroke 寬度、`currentColor`）新增。

## Implementation Contract

**Behavior**
- 電腦版（≥900px）側欄對 admin、member 多一個「工具箱」，點了進 `/tools`；390px 底部導覽沒有它，但直接開 `/tools` 可用。
- `/tools` 依序顯示「團隊內部工具」「現場演出工具」「其他」三區，每區內依 `position` 由小到大排卡片；卡片顯示圖示、名稱、說明，整張卡是 `<a target="_blank" rel="noopener noreferrer">`。沒有工具的區塊不顯示。
- 頁首有「新增工具」與「編輯」開關。平常只顯示卡片（圖示、名稱、說明），沒有任何操作按鈕、也不顯示已下架清單；按「編輯」（按鈕變成「完成」）後，每張卡下方才出現「編輯」「上移」「下移」三個小圓圈 icon 按鈕、右上角有「下架」小叉叉（`.tool-btn`：淺灰細框、無陰影；滑鼠移上去或鍵盤聚焦時立刻顯示說明；`aria-label` 帶工具名稱；不能用時變淡）；編輯模式下頁面底部才出現收合的「已下架（n）」清單，每筆有「復原」。
- 新增時 `position` = 該區目前最大值 + 1；編輯改分區時也排到新區最後；復原時排到原分區最後。
- 存檔成功後頁面重新取得資料（`revalidatePath("/tools")`），卡片立即出現，重新整理後仍在。

**Interface / data shape**
- `lib/tools.ts`：`type ToolSection = "internal" | "live" | "other"`；`type Tool = { id, section, icon, name, description, url, position, archivedAt: string | null }`；`validateToolInput(raw: Record<string, string>): { ok: true; value: ToolInput } | { ok: false; error: string }`；資料函式 `listTools(actor)`、`createTool(actor, input)`、`updateTool(actor, id, input)`、`moveTool(actor, id, dir: -1 | 1)`、`archiveTool(actor, id)`、`restoreTool(actor, id)`，全部經 `db(actor)`。
- `app/(app)/tools/actions.ts`：`createTool`、`updateTool`、`moveTool`、`archiveTool`、`restoreTool` 五個 server action，收 `FormData`，回 `{ ok: true } | { ok: false; error: string }`。
- 資料庫：表 `tools`、函式 `tools_move(uuid, int)`。

**Failure modes**
- 驗證失敗：表單下方顯示白話錯誤（例：「網址要用 http:// 或 https:// 開頭」「名稱請填 1 到 40 個字」），不寫入。
- 權限不足：finance_partner 開 `/tools` 被導回財務首頁；直接呼叫 action 回「你沒有工具箱的權限」，不寫入。未登入開 `/tools` 被導去登入頁。
- 資料庫錯誤：顯示「存檔失敗，請稍後再試」，不顯示技術錯誤。

**Acceptance criteria**
- `npm run test`：`lib/tools.test.ts` 覆蓋 http/https 通過、`javascript:`／`ftp:`／無法解析的網址被擋、長度邊界、分區白名單；`lib/auth/access.test.ts` 覆蓋三種角色對 `tools` 的結果。
- `npm run test:db`：`supabase/test/tools.test.sql` 驗證種子 11 筆且三區數量為 4／6／1、非 http(s) 網址被 check 擋、`tools_move` 對調與邊界不變、anon／authenticated 無權讀寫、沒有 DELETE 權限。
- `npm run typecheck`、`npm run lint` 通過。
- 本機用 `dev-member`、`dev-finance`、未登入三種身分各開一次 `/tools`，1280px 與 390px 各截圖一次；新增→重新整理仍在、編輯、上下移、下架→復原各走一次。

**Scope boundaries**
- In scope：上述表、函式、頁面、action、權限區域、導覽項、icon、測試。
- Out of scope：T-21 投票前端、GitHub Pages 工具箱首頁、Google 試算表、其他頁面的版面。

## Risks / Trade-offs

- [平台與 GitHub Pages 兩份清單會分歧] → 票上已註明暫時各自維護；之後若要以平台為準，另開票讓 GitHub Pages 讀平台資料或導過來。
- [種子資料裡有網址目前打不開：社群素材產生器 `https://jessechen-humanoid.github.io/jokesonme-post/` 實測回 404] → 照原清單放入，開 PR 時列給柏文確認正確網址；上線後也能直接在頁面上改。
- [團員都能改所有工具，誤改無法一鍵還原] → `attach_audit` 留下每次修改的紀錄；下架可復原。

## Migration Plan

- 合併後由 Jesse 對正式庫跑 `npm run db:migrate`，會建立 `tools` 並放入 11 筆。
- 回滾：撤掉 nav 項與頁面即可；`tools` 表留著不影響其他功能。

## Open Questions

- 社群素材產生器的正確網址（目前 404），待柏文或傑哥確認。
