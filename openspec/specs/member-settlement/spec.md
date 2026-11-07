# member-settlement Specification

## Purpose

TBD - created by archiving change 'analytics-v2'. Update Purpose after archive.

## Requirements

### Requirement: Settlement record storage

The system SHALL store member settlement records in a Google Sheets tab named "成員結算" with columns: 成員 (member name), 金額 (amount), 日期 (date), 備註 (notes).

#### Scenario: Settlement sheet created on first use

- **WHEN** a settlement record is added and the "成員結算" sheet does not exist
- **THEN** the system creates the sheet with the correct headers


<!-- @trace
source: analytics-v2
updated: 2026-03-24
code:
  - js/api.js
  - .DS_Store
  - RAW DATA/20260322_2026 年度會議｜看我畫大餅_活動報名狀態_47筆.xlsx
  - js/shared.js
  - js/import.js
  - analytics.html
  - RAW DATA/20260322_應援撥款明細_1筆.xlsx
  - gas/Code.gs
  - css/style.css
  - js/transaction.js
  - RAW DATA/20260322_看我笑話｜第 2 季 4 月號_活動報名狀態_142筆.xlsx
  - js/analytics.js
  - RAW DATA/.DS_Store
  - index.html
  - RAW DATA/20260322_應援撥款明細_220筆.xlsx
-->

---
### Requirement: Add settlement record

The system SHALL provide a button in the member earnings section to add a new settlement record. A settlement record represents profit distribution only and MUST NOT include any advance reimbursement amount.

Clicking the button SHALL open a modal form with fields: member (dropdown), amount (number, the profit amount), date (date picker), notes (text). The modal SHALL NOT display any advance section and SHALL NOT show a "一起結清代墊" checkbox. Submitting the form SHALL append one row to the "成員結算" sheet with the entered amount and SHALL refresh the member earnings table. Submitting SHALL NOT read, modify, or mark any advance transactions.

Advance reimbursements are recorded separately via the advance reimbursement ledger (see capability `advance-reimbursement-ledger`), not through this settlement form.

#### Scenario: Add a profit settlement

- **WHEN** user clicks "新增結算", selects member "兔子", enters amount 10000, date "2026-06-05", and submits
- **THEN** a new row [兔子, 10000, 2026-06-05, ...] is appended to the "成員結算" sheet, the member earnings table updates, and no advance transactions are modified

#### Scenario: Settlement modal has no advance section

- **WHEN** user opens the "新增結算" modal and selects any member, regardless of whether that member has advance transactions
- **THEN** the modal shows only member, amount, date, and notes fields, with no advance breakdown and no "一起結清代墊" checkbox


<!-- @trace
source: advance-reimbursement-ledger
updated: 2026-06-05
code:
  - RAW DATA/20260412_應援撥款明細_444筆.xlsx
  - RAW DATA/20260412_應援訂單_85筆.csv
  - .DS_Store
  - RAW DATA/20260410_2026 支薪好友喜劇專場 《向上管理》_活動報名狀態_273筆.xlsx
  - RAW DATA/20260412_應援票券訂單_515筆.csv
  - RAW DATA/20260410_看我笑話｜第 2 季 4 月號_活動報名狀態_148筆.xlsx
  - gas/Code.gs
  - js/analytics.js
  - RAW DATA/20260410_2026 好竹弋漫才專場 《直球》_活動報名狀態_75筆.xlsx
  - RAW DATA/20260410_看我笑話｜第 2 季 5 月號_活動報名狀態_142筆.xlsx
  - js/api.js
  - CLAUDE.md
-->

---
### Requirement: Settlement profit year

Each settlement record SHALL carry a profit year (`for_year`): the calendar year whose profit the payout distributes. The member earnings report for a given year SHALL count a settlement as "已付" by its profit year, not by the year of its payout date. The default profit year SHALL be the payout date's year, except that a payout dated in January SHALL default to the previous year (December's share is paid on the 10th of January). The settlement form SHALL show the default and allow the user to change it.

#### Scenario: December share paid in January counts toward the previous year

- **WHEN** a settlement dated 2027-01-10 is added without changing the profit year
- **THEN** it is stored with profit year 2026 and appears in the 2026 member earnings report as 已付, and not in 2027

#### Scenario: Explicit profit year overrides the default

- **WHEN** the user adds a settlement dated 2027-01-20 and selects profit year 2027
- **THEN** it is stored with profit year 2027 and counts toward 2027

#### Scenario: Rows inserted without a profit year

- **WHEN** a settlement row is inserted without a profit year (legacy script, migration)
- **THEN** the database applies the default rule so the column is never null

<!-- @trace
source: settlement-profit-year (Jesse 2026-11-07 拍板：12 月分潤在隔年 1/10 出款算前一年)
updated: 2026-11-07
code:
  - platform/supabase/migrations/0016_settlement_year.sql
  - platform/lib/finance/calc.ts
  - platform/app/(app)/finance/actions.ts
  - platform/components/ledger-sheet.tsx
-->

---
### Requirement: Get settlement records

The system SHALL provide an API action to retrieve all settlement records from the "成員結算" sheet.

#### Scenario: Retrieve all settlements

- **WHEN** a GET request is sent with action `getSettlements`
- **THEN** the API returns all settlement records as an array of objects with member, amount, date, and notes fields

<!-- @trace
source: analytics-v2
updated: 2026-03-24
code:
  - js/api.js
  - .DS_Store
  - RAW DATA/20260322_2026 年度會議｜看我畫大餅_活動報名狀態_47筆.xlsx
  - js/shared.js
  - js/import.js
  - analytics.html
  - RAW DATA/20260322_應援撥款明細_1筆.xlsx
  - gas/Code.gs
  - css/style.css
  - js/transaction.js
  - RAW DATA/20260322_看我笑話｜第 2 季 4 月號_活動報名狀態_142筆.xlsx
  - js/analytics.js
  - RAW DATA/.DS_Store
  - index.html
  - RAW DATA/20260322_應援撥款明細_220筆.xlsx
-->

---