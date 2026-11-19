## MODIFIED Requirements

### Requirement: Icon navigation

The bottom navigation on phones and the sidebar on desktop (≥ 900px) SHALL show a line icon above or beside every label: 首頁, 演出, 財務, 行事曆, 筆記. The desktop sidebar SHALL additionally show 開發 and then 工具箱 for `admin` and `member`; the phone bottom navigation SHALL NOT show 開發 or 工具箱, and `/tickets` and `/tools` SHALL still open when their addresses are entered on a phone. The current section SHALL be marked by persimmon icon and label.

#### Scenario: Current section on a phone

- **WHEN** a member is on any /shows page
- **THEN** the 演出 item shows its icon and label in persimmon and the other items in `--ink-2`

#### Scenario: Dev tickets only in the desktop sidebar

- **WHEN** a member views the app at 1280px width and then at 390px width
- **THEN** 開發 appears in the sidebar at 1280px and does not appear in the bottom navigation at 390px

#### Scenario: Toolbox only in the desktop sidebar

- **WHEN** a member views the app at 1280px width and then at 390px width
- **THEN** 工具箱 appears in the sidebar after 開發 at 1280px, does not appear in the bottom navigation at 390px, and entering `/tools` at 390px still opens the toolbox
