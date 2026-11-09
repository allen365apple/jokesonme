## MODIFIED Requirements

### Requirement: Icon navigation

The bottom navigation on phones and the sidebar on desktop (≥ 900px) SHALL show a line icon above or beside every label: 首頁, 演出, 財務, 行事曆, 筆記. The desktop sidebar SHALL additionally show 開發票 for `admin` and `member`; the phone bottom navigation SHALL NOT show 開發票, and `/tickets` SHALL still open when its address is entered on a phone. The current section SHALL be marked by persimmon icon and label.

#### Scenario: Current section on a phone

- **WHEN** a member is on any /shows page
- **THEN** the 演出 item shows its icon and label in persimmon and the other items in `--ink-2`

#### Scenario: Dev tickets only in the desktop sidebar

- **WHEN** a member views the app at 1280px width and then at 390px width
- **THEN** 開發票 appears in the sidebar at 1280px and does not appear in the bottom navigation at 390px
