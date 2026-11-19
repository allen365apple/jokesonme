## ADDED Requirements

### Requirement: Toolbox page lists tools by section

The system SHALL provide a page at `/tools` that lists every tool whose `archived_at` is empty as a card showing its icon, name, and one-line description. Cards SHALL be grouped into three sections shown in this fixed order: 團隊內部工具 (`internal`), 現場演出工具 (`live`), 其他 (`other`). Within a section, cards SHALL be ordered by `position` ascending. A section with no listed tools SHALL NOT be shown. At widths below 900px the page SHALL show one card per row.

#### Scenario: Sections in fixed order

- **WHEN** a member opens `/tools` and tools exist in all three sections
- **THEN** the page shows 團隊內部工具, then 現場演出工具, then 其他, each with its cards ordered by `position`

#### Scenario: Phone width shows one card per row

- **WHEN** a member opens `/tools` at 390px width
- **THEN** every card spans the full content width and no card sits beside another

### Requirement: Tool cards open the existing tool address

Each tool card SHALL be a link to the tool's stored `url` that opens in a new browser tab with `rel="noopener noreferrer"`. The platform SHALL NOT copy, proxy, or rewrite the tool itself.

#### Scenario: Open a tool

- **WHEN** a member clicks the 看我摸牌 card
- **THEN** a new tab opens `https://allen365apple.github.io/jokes-on-me/mahjong-draw.html` and the `/tools` tab stays open

### Requirement: Members add and edit tools

`/tools` SHALL show a 編輯 toggle next to 新增工具. While the toggle is off, cards SHALL show only icon, name, and description, with no per-card controls and no 已下架 list; turning it on (the button then reads 完成) SHALL reveal each card's edit, move up, move down, and archive controls and the 已下架 list, and SHALL stay on after any of those actions until 完成 is pressed. `admin` and `member` users SHALL be able to add a tool from `/tools` by entering icon, name, description, URL, and section, and SHALL be able to edit every one of those fields on an existing tool. A newly added tool, and a tool whose section is changed, SHALL be placed last in its section. After a successful save the card SHALL appear without a manual reload and SHALL still be present after reloading.

#### Scenario: Add a tool

- **WHEN** a member adds icon 🎲, name 骰子機, description 現場擲骰子, URL `https://example.com/dice`, section 現場演出工具
- **THEN** a 骰子機 card appears as the last card in 現場演出工具, and it is still there after the page reloads

#### Scenario: Move a tool to another section by editing

- **WHEN** a member edits 網頁製作須知 and changes its section from 團隊內部工具 to 其他
- **THEN** 網頁製作須知 no longer appears in 團隊內部工具 and appears as the last card in 其他

### Requirement: Icon picker with search

The tool form SHALL show a 選圖示 button beside the icon field. Pressing it SHALL expand, inside the form, a list of common emoji grouped under Chinese headings with a search box; the search SHALL match Chinese names and keywords, Latin keywords case-insensitively, or a pasted emoji, and SHALL say plainly when nothing matches. Choosing an emoji SHALL put it into the icon field, collapse the list, and return focus to the 選圖示 button. The icon field SHALL still accept any emoji typed or pasted directly, subject to Tool input validation.

##### Example: Search terms

| Search text | Shown emoji include |
| ----------- | ------------------- |
| 麥克風 | 🎤, 🎙️ |
| 投票 | 🗳️ |
| ai | 🤖 |
| 🦦 | 🦦 |
| 完全不存在的關鍵字 | none, with a hint to type the emoji directly |

#### Scenario: Search and pick an emoji

- **WHEN** a member opens 選圖示, types 麥克風, and picks 🎙️
- **THEN** the icon field shows 🎙️, the list collapses, and focus returns to the 選圖示 button

#### Scenario: Type an emoji that is not in the list

- **WHEN** a member types 🪩 directly into the icon field and saves the tool
- **THEN** the tool is saved with icon 🪩

### Requirement: Tool input validation

The system SHALL reject a tool save and show a plain-Chinese message, writing nothing, when any of these hold after trimming whitespace: icon is empty or longer than 8 characters; name is empty or longer than 40 characters; description is longer than 120 characters; section is not `internal`, `live`, or `other`; URL cannot be parsed or its scheme is not `http` or `https`. The database SHALL also refuse any `url` not starting with `http://` or `https://`.

##### Example: URL acceptance

| URL entered | Result |
| ----------- | ------ |
| `https://allen365apple.github.io/jokes-on-me/` | accepted |
| `http://example.com/a?b=1` | accepted |
| `javascript:alert(1)` | rejected: 網址要用 http:// 或 https:// 開頭 |
| `ftp://example.com/file` | rejected: 網址要用 http:// 或 https:// 開頭 |
| `example.com` | rejected: 網址要用 http:// 或 https:// 開頭 |

#### Scenario: Script URL is refused

- **WHEN** a member saves a tool with URL `javascript:alert(1)`
- **THEN** the form shows 網址要用 http:// 或 https:// 開頭 and no tool is created or changed

### Requirement: Reorder tools within a section

`admin` and `member` users SHALL be able to move a listed tool one step up or down within its section. The move SHALL swap the tool's `position` with the adjacent listed tool in the same section in a single database transaction. Moving the first tool up or the last tool down SHALL leave the order unchanged. Archived tools SHALL NOT take part in the ordering.

##### Example: Move down

- **GIVEN** 現場演出工具 lists 看我戀愛, 看我笑話現場投票, 看我摸牌 in that order
- **WHEN** a member moves 看我戀愛 down
- **THEN** the order becomes 看我笑話現場投票, 看我戀愛, 看我摸牌

#### Scenario: First tool cannot move up

- **WHEN** a member moves the first tool of a section up
- **THEN** the section order is unchanged and no error is shown

### Requirement: Archive and restore tools

`admin` and `member` users SHALL be able to archive (下架) a tool; archiving SHALL set `archived_at` and SHALL NOT delete the row. Archived tools SHALL NOT appear as cards and SHALL be listed, while the page is in edit mode, in a collapsed 已下架 list on `/tools`, each with a 復原 action. Restoring SHALL clear `archived_at` and place the tool last in its section. The `tools` table SHALL NOT grant DELETE to any role.

#### Scenario: Archive then restore

- **WHEN** a member archives 現場抽籤機 and then restores it from 已下架
- **THEN** 現場抽籤機 disappears from 現場演出工具 after archiving, appears in 已下架, and after restoring appears as the last card of 現場演出工具 with its original name, description, and URL

### Requirement: Tool records are server-side and audited

Tool records SHALL be stored in the platform database table `tools` with row level security enabled and no policies, with all privileges revoked from `public`, `anon`, and `authenticated`, and with `service_role` granted only select, insert, and update. Every write SHALL go through the server with the acting user recorded by the audit trigger. The reorder function SHALL be executable only by `service_role`.

#### Scenario: Anonymous client cannot read tools

- **WHEN** a client using the anon key selects from `tools`
- **THEN** the database refuses the request with a permission error

### Requirement: Initial tool catalog

The migration that creates `tools` SHALL insert these eleven tools so that the page is populated after deployment:

| Section | Icon | Name | URL |
| ------- | ---- | ---- | --- |
| internal | 🦦 | 陪伴動物心理測驗 | `https://allen365apple.github.io/jokes-on-me/companion-animals.html` |
| internal | 💌 | 走心分享預覽 | `https://allen365apple.github.io/jokes-on-me/member-only-content/latest.html` |
| internal | 🎨 | 社群素材產生器 | `https://jessechen-humanoid.github.io/jokesonme-post/` |
| internal | 📋 | 網頁製作須知 | `https://allen365apple.github.io/jokes-on-me/web-guide.html` |
| live | 💗 | 看我戀愛 | `https://allen365apple.github.io/jokes-on-me/love-improv/index.html` |
| live | ⚔️ | 看我笑話現場投票 | `https://allen365apple.github.io/jokes-on-me/live-vote/index.html` |
| live | 🀄 | 看我摸牌 | `https://allen365apple.github.io/jokes-on-me/mahjong-draw.html` |
| live | 🕺 | 看我動作片 | `https://allen365apple.github.io/jokes-on-me/action-draw.html` |
| live | 🎫 | 現場抽籤機 | `https://allen365apple.github.io/jokes-on-me/comment-lottery.html` |
| live | ❓ | 現場問答系統 by 支薪好友 | `https://allen365apple.github.io/jokes-on-me/fwb-quiz/home.html` |
| other | 📅 | 看笑演出行事曆（公開） | the public Google Calendar embed address used by the GitHub Pages toolbox |

Within each section the tools SHALL be positioned in the table order.

#### Scenario: Fresh database after migration

- **WHEN** the migration runs on an empty database
- **THEN** `tools` holds eleven listed rows: four `internal`, six `live`, one `other`
