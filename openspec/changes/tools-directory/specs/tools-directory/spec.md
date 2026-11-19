## ADDED Requirements

### Requirement: Toolbox page lists tools by section

The system SHALL provide a page at `/tools` that lists every tool whose `archived_at` is empty as a card showing its icon, name, and one-line description. Cards SHALL be grouped into the sections stored in `tool_sections` whose `archived_at` is empty, shown in ascending section `position`; within a section, cards SHALL be ordered by tool `position` ascending. Outside edit mode a section with no listed tools SHALL NOT be shown, cards SHALL be one per row below 900px and two per row from 900px. In edit mode every active section SHALL be shown, including empty ones, and cards SHALL be one per row at every width.

#### Scenario: Default section order

- **WHEN** a member opens `/tools` on a freshly migrated database
- **THEN** the page shows 現場演出工具, then 團隊內部工具, then 其他, each with its cards ordered by `position`

#### Scenario: Phone width shows one card per row

- **WHEN** a member opens `/tools` at 390px width
- **THEN** every card spans the full content width and no card sits beside another

#### Scenario: Empty section only visible while editing

- **WHEN** a member adds a section named 測試區 and then presses 完成
- **THEN** 測試區 is shown while editing and is hidden after 完成 because it has no listed tools

### Requirement: Tool cards open the existing tool address

Each tool card SHALL be a link to the tool's stored `url` that opens in a new browser tab with `rel="noopener noreferrer"`. The platform SHALL NOT copy, proxy, or rewrite the tool itself.

#### Scenario: Open a tool

- **WHEN** a member clicks the 看我摸牌 card
- **THEN** a new tab opens `https://allen365apple.github.io/jokes-on-me/mahjong-draw.html` and the `/tools` tab stays open

### Requirement: Edit mode for the toolbox

`/tools` SHALL show a 編輯 toggle next to 新增工具. While the toggle is off, the page SHALL show only section headings and cards, with no controls and no 已下架 list. Turning it on (the button then reads 完成) SHALL reveal: on each tool, a drag handle, an edit control, and an archive control; on each section, a drag handle, a rename control, and a delete control; a 新增區塊 button; and the 已下架 list. Edit mode SHALL stay on after any of these actions until 完成 is pressed. Each control SHALL show its purpose immediately on pointer hover or keyboard focus.

#### Scenario: Clean view by default

- **WHEN** a member opens `/tools`
- **THEN** no drag handle, edit, archive, rename, or delete control is visible until 編輯 is pressed

### Requirement: Members add and edit tools

`admin` and `member` users SHALL be able to add a tool from `/tools` by entering icon, name, description, URL, and section, and SHALL be able to edit every one of those fields on an existing tool. The section choice SHALL list the active sections in their current order. A newly added tool, and a tool whose section is changed, SHALL be placed last in its section. After a successful save the card SHALL appear without a manual reload and SHALL still be present after reloading.

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

The system SHALL reject a tool save and show a plain-Chinese message, writing nothing, when any of these hold after trimming whitespace: icon is empty or longer than 8 characters; name is empty or longer than 40 characters; description is longer than 120 characters; the section is not an existing section whose `archived_at` is empty (checked on the server); URL cannot be parsed or its scheme is not `http` or `https`. The database SHALL also refuse any `url` not starting with `http://` or `https://`.

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

#### Scenario: Deleted section is refused

- **WHEN** a member submits a tool whose section was deleted by someone else after the form opened
- **THEN** the form shows 這個區塊已經不在了，請重新整理後再選 and no tool is created or changed

### Requirement: Manage toolbox sections

In edit mode `admin` and `member` users SHALL be able to add a section (name 1–20 characters after trimming, placed last), rename a section (same name rule), and delete a section. Deleting SHALL set the section's `archived_at` and SHALL NOT delete the row. The system SHALL refuse, with a plain-Chinese message and no change, to delete a section that still holds listed tools or the last remaining active section; archived tools in a section do not block its deletion. The `tool_sections` table SHALL NOT grant DELETE to any role.

##### Example: Delete rules

| Section state | Delete result |
| ------------- | ------------- |
| no tools at all | deleted |
| only archived tools | deleted |
| one or more listed tools | refused: 區塊裡還有工具，先把工具移走或下架再刪除 |
| the only active section | refused: 至少要留一個區塊 |

#### Scenario: Rename a section

- **WHEN** a member renames 其他 to 公開資訊
- **THEN** the heading reads 公開資訊, the section choice in the tool form lists 公開資訊, and the change survives a reload

### Requirement: Drag to reorder sections and tools

In edit mode `admin` and `member` users SHALL be able to reorder sections, and reorder tools within one section, by dragging the item's drag handle with mouse, pen, or touch. Dragging SHALL start only from the handle; while dragging, the item SHALL follow the pointer and a drop marker SHALL show the destination without shifting other items; releasing SHALL move the item there, and `Escape` SHALL cancel the drag. A tool SHALL NOT be dropped into another section by dragging. The page SHALL show the new order immediately and save it by sending the full ordered list of ids for that section (or of all active sections) to a database function that applies every position in one transaction. If the ids sent do not exactly match the current listed ids, the function SHALL refuse; the page SHALL then restore the previous order and show 清單已經被別人改過，請重新整理後再排. Any other save failure SHALL also restore the previous order with a plain-Chinese message. With keyboard focus on a drag handle, `ArrowUp` and `ArrowDown` SHALL move the item one place and the new position SHALL be announced politely to assistive technology.

##### Example: Drop a tool

- **GIVEN** 現場演出工具 lists 看我戀愛, 看我笑話現場投票, 看我摸牌 in that order
- **WHEN** a member drags 看我摸牌 by its handle and releases it above 看我戀愛
- **THEN** the order becomes 看我摸牌, 看我戀愛, 看我笑話現場投票 and is the same after a reload

#### Scenario: Reorder sections with the keyboard

- **WHEN** a member focuses the drag handle of 團隊內部工具 and presses `ArrowUp`
- **THEN** 團隊內部工具 becomes the first section, the change is announced, and it survives a reload

#### Scenario: Stale order is refused

- **WHEN** a member drops a tool after another member archived a tool in the same section
- **THEN** the page restores the previous order, shows 清單已經被別人改過，請重新整理後再排, and no position changes in the database

### Requirement: Archive and restore tools

`admin` and `member` users SHALL be able to archive (下架) a tool; archiving SHALL set `archived_at` and SHALL NOT delete the row. Archived tools SHALL NOT appear as cards and SHALL be listed, while the page is in edit mode, in a collapsed 已下架 list on `/tools`, each with a 復原 action. Restoring SHALL clear `archived_at` and place the tool last in its section; if that section has been deleted, the tool SHALL be placed last in the first active section. The `tools` table SHALL NOT grant DELETE to any role.

#### Scenario: Archive then restore

- **WHEN** a member archives 現場抽籤機 and then restores it from 已下架
- **THEN** 現場抽籤機 disappears from 現場演出工具 after archiving, appears in 已下架, and after restoring appears as the last card of 現場演出工具 with its original name, description, and URL

#### Scenario: Restore into a deleted section

- **WHEN** a member restores an archived tool whose section was deleted
- **THEN** the tool appears as the last card of the first section on the page

### Requirement: Tool records are server-side and audited

Tool and section records SHALL be stored in the platform database tables `tools` and `tool_sections` with row level security enabled and no policies, with all privileges revoked from `public`, `anon`, and `authenticated`, and with `service_role` granted only select, insert, and update. Every write SHALL go through the server with the acting user recorded by the audit trigger. The reorder functions SHALL be executable only by `service_role`.

#### Scenario: Anonymous client cannot read tools

- **WHEN** a client using the anon key selects from `tools` or `tool_sections`
- **THEN** the database refuses the request with a permission error

### Requirement: Initial tool catalog

The migration that creates the tables SHALL insert three sections in this order: 現場演出工具, 團隊內部工具, 其他; and these ten tools so that the page is populated after deployment:

| Section | Icon | Name | URL |
| ------- | ---- | ---- | --- |
| 現場演出工具 | 💗 | 看我戀愛 | `https://allen365apple.github.io/jokes-on-me/love-improv/index.html` |
| 現場演出工具 | ⚔️ | 看我笑話現場投票 | `https://allen365apple.github.io/jokes-on-me/live-vote/index.html` |
| 現場演出工具 | 🀄 | 看我摸牌 | `https://allen365apple.github.io/jokes-on-me/mahjong-draw.html` |
| 現場演出工具 | 🕺 | 看我動作片 | `https://allen365apple.github.io/jokes-on-me/action-draw.html` |
| 現場演出工具 | 🎫 | 現場抽籤機 | `https://allen365apple.github.io/jokes-on-me/comment-lottery.html` |
| 現場演出工具 | ❓ | 現場問答系統 by 支薪好友 | `https://allen365apple.github.io/jokes-on-me/fwb-quiz/home.html` |
| 團隊內部工具 | 💌 | 走心分享預覽 | `https://allen365apple.github.io/jokes-on-me/member-only-content/latest.html` |
| 團隊內部工具 | 🎨 | 社群素材產生器 | `https://jessechen-humanoid.github.io/jokesonme-post/` |
| 團隊內部工具 | 📋 | 網頁製作須知 | `https://allen365apple.github.io/jokes-on-me/web-guide.html` |
| 其他 | 📅 | 看笑演出行事曆（公開） | the public Google Calendar embed address used by the GitHub Pages toolbox |

Within each section the tools SHALL be positioned in the table order.

#### Scenario: Fresh database after migration

- **WHEN** the migration runs on an empty database
- **THEN** `tool_sections` holds three active rows in the order 現場演出工具, 團隊內部工具, 其他, and `tools` holds ten listed rows: six, three, and one in those sections
