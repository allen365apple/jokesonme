## Why

看我笑話的小工具（現場投票、看我戀愛、抽籤機……）散在 GitHub Pages 的工具箱首頁，平台左側欄沒有入口，新夥伴不知道有哪些工具；清單存在一份要輸密碼的 Google 試算表，平台上看不到也改不了。票 T-20 要把工具目錄搬進平台，讓團員直接在平台上看、加、改。

## What Changes

- 電腦版左側欄新增「工具箱」，連到新頁面 `/tools`；手機底部導覽不加，`/tools` 在手機上直接開仍可用。
- `/tools` 分「團隊內部工具／現場演出工具／其他」三區，用卡片列出工具（圖示、名稱、一句話說明）；點卡片在新分頁開該工具既有網址，工具本體與網址都不搬。
- 工具清單存在平台資料庫的新表 `tools`（新 migration），並在同一支 migration 放入第一版 10 筆資料（票上列 11 個，柏文決定拿掉「陪伴動物心理測驗」）。
- 團員與管理員可以在 `/tools` 新增工具、編輯每個欄位、在同一區裡上下調順序、下架工具；下架是軟刪除，資料留著，在「已下架」清單可以復原。
- 網址只接受 `http://` 或 `https://` 開頭，其他（例如 `javascript:`）一律擋下並顯示白話錯誤。
- 權限新增區域 `tools`：`admin`、`member` 可看可改；`finance_partner` 看不到入口，直接開 `/tools` 或呼叫寫入動作都會被擋；沒登入的人被導去登入頁。
- 畫面只用品牌設計系統既有的 CSS 變數與 class，不加新顏色；手機 390px 一行一張卡。

## Non-Goals

- 不搬任何工具本體，也不改各工具的網址；現場投票前端搬進平台是另一張票 T-21。
- GitHub Pages 的工具箱首頁與它背後的 Google 試算表這次不動，兩邊暫時各自維護一份清單，不做同步。
- 不做工具的分類自訂（三區固定）、不做圖片上傳圖示（圖示用一個 emoji 字元）、不做硬刪除。

## Capabilities

### New Capabilities

- `tools-directory`: 平台內的工具目錄頁 `/tools`——三區卡片、外連、團員新增／編輯／調順序／下架與復原，以及資料表與第一版資料。

### Modified Capabilities

- `line-login-access`: 角色權限表新增「工具箱」區域：admin、member 可用，finance_partner 不可用。
- `mobile-first-ui`: 電腦版側欄在「開發」之外再多一個只在電腦版出現的「工具箱」。

## Impact

- 新增檔案：platform/supabase/migrations/0020_tools.sql、platform/supabase/test/tools.test.sql、platform/lib/tools.ts、platform/lib/tools.test.ts、platform/app/(app)/tools/page.tsx、platform/app/(app)/tools/actions.ts、platform/components/tools-board.tsx
- 修改檔案：platform/lib/auth/access.ts、platform/lib/auth/access.test.ts、platform/components/bottom-nav.tsx、platform/components/icons.tsx
- 資料庫：新表 `tools` 與調順序用的函式；合併後需要 Jesse 對正式庫跑 `npm run db:migrate`。
- 不影響既有頁面的資料與權限；finance_partner 能看到的頁面不變。
