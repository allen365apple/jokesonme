## ADDED Requirements

### Requirement: Quick add from finance overview

The finance overview SHALL show a floating add button at the bottom right. Tapping it SHALL first ask which project the entry belongs to, offering performances through the shared show picker and every show of kind `ledger` in a separate group. After a project is chosen, the system SHALL open the same add-transaction sheet used on the show finance page, bound to that project, with a way to go back and choose another project. Saving SHALL use the same transaction save action, and the overview figures SHALL reflect the new entry without a manual reload. On phones the button SHALL sit above the bottom navigation and SHALL NOT cover the last content of the page.

#### Scenario: Add an expense to a performance from the overview

- **WHEN** a finance member on 財務總覽 taps ＋, chooses the performance 「12 月號」, enters an expense of 3000 in 場地租借 and taps 新增
- **THEN** the transaction is saved under 「12 月號」, the overview shows 「已新增到「12 月號」」, and the 成本 figure grows by 3000

#### Scenario: Add to a non-performance ledger

- **WHEN** a finance member taps ＋ and chooses 「共同基金支出」 under 非演出科目
- **THEN** the add-transaction sheet opens titled 「新增收支・共同基金支出」

#### Scenario: Change project before saving

- **WHEN** the sheet is open for one project and the member taps 換一個專案
- **THEN** the project chooser appears again and nothing is saved
