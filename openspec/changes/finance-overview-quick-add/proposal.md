## Why

票：T-19《財務總覽右下角加「＋」，直接新增收支，再選要記在哪裡》。

柏文 2026-11-10：在財務頁要新增一筆收支，得先點「演出收支」→ 點進那一場 → 右下角＋才能記；或是到「待確認」最下面的快速輸入。希望一進財務總覽，右下角就有＋，按下去先選要記在哪裡，再直接填。

## What Changes

- 財務總覽（`/finance`）右下角加浮動「＋」（沿用既有 `.fab` 樣式，手機在底部導覽列上方，電腦在右下角）。
- 按下去先出「記在哪裡？」面板：演出用共用選演出面板（下一場、接下來的演出、更多…），下方另列全部非演出科目（kind `ledger`，例如會員、頻道、共同基金支出）。
- 選完直接打開演出詳細頁同一個新增收支面板（`TxSheet`，不另寫表單），多一顆「換一個專案」可回上一步。
- 存檔走既有 `saveTransaction`，伺服器 revalidate 後總覽的 KPI、圖表、演出收支表立即更新，並顯示「已新增到「專案名」」。

## Non-Goals

- 不新增「不屬於任何專案」的收支：每筆收支仍必須掛一個專案（演出或非演出科目），資料表與伺服器檢查不變。
- 不改演出詳細頁與待確認頁既有的新增方式。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `transaction-management`: 財務總覽可直接新增收支（先選專案）

## Impact

- 新增 platform/components/finance-quick-add.tsx
- platform/components/tx-board.tsx（匯出 TxSheet、可選的 onBack）
- platform/app/(app)/finance/page.tsx
