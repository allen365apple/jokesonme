## Purpose

Dev tickets let troupe members file, claim, deliver, and accept platform development work in one shared board, and give the claimer a kickoff prompt that points Claude at the repository's collaboration rules.

## ADDED Requirements

### Requirement: Ticket record

The system SHALL store each dev ticket with a sequential number displayed as `T-<number>`, a title of 1 to 120 characters, a category, a description, a status, the reporter, and an optional owner. Category SHALL be one of `feature` (新功能), `bug` (修 Bug), `process` (改善流程), `data` (修正資料). Status SHALL be one of `open` (待處理), `in_progress` (處理中), `review` (待驗收), `done` (已完成), `wontfix` (不做). Ticket numbers SHALL NOT be reused and tickets SHALL NOT be hard-deleted.

#### Scenario: New ticket gets the next number

- **WHEN** a member files a ticket while the highest existing number is 7
- **THEN** the new ticket is stored with number 8, status `open`, no owner, and the member as reporter, and the page shows it as `T-8`

#### Scenario: Title too long is rejected

- **WHEN** a member submits a ticket whose title has 121 characters
- **THEN** the ticket is not created and the form shows that the title must be at most 120 characters

### Requirement: Description template

The new-ticket form SHALL prefill the description with four headed sections in this order: 現在怎樣、希望變成、做完看得到什麼（驗收）、誰會用、誰看得到.

#### Scenario: Form opens with the template

- **WHEN** a member opens the new-ticket form
- **THEN** the description field already contains the four section headings in the specified order

### Requirement: Ticket status transitions

The system SHALL allow only the following actions, each moving a ticket between the listed statuses and only for the listed people. Any other combination SHALL be refused with a Chinese reason and SHALL NOT change the ticket.

##### Example: action table

| Action | From | To | Allowed actor | Extra rule |
| ------ | ---- | -- | ------------- | ---------- |
| claim | open | in_progress | admin or member | ticket has no owner; owner becomes the actor |
| unclaim | in_progress | open | owner, reporter, or admin | owner is cleared |
| deliver | in_progress | review | owner or admin | |
| accept | review | done | admin, or reporter who is not the owner | |
| reject | review | in_progress | admin, or reporter who is not the owner | reason required |
| wontfix | open, in_progress, review | wontfix | reporter or admin | reason required; owner kept |
| reopen | wontfix | open | admin | owner is cleared |
| edit | open with no owner | open | reporter or admin | only title, category, description change |

#### Scenario: Owner cannot accept own work

- **WHEN** member 柏文 owns T-3 in `review` but is not its reporter, and 柏文 tries to accept T-3
- **THEN** the system refuses with a reason saying the owner cannot accept their own ticket and T-3 stays in `review`

#### Scenario: Reporter accepts delivered work

- **WHEN** member 巧達 reported T-3, member 柏文 owns it, T-3 is in `review`, and 巧達 accepts it
- **THEN** T-3 becomes `done` and the history records 巧達 accepting it

#### Scenario: Admin accepts a ticket the admin filed and built

- **WHEN** admin Jesse is both reporter and owner of T-5 in `review` and accepts it
- **THEN** T-5 becomes `done`

#### Scenario: Reject without a reason

- **WHEN** a reporter rejects a ticket in `review` with an empty reason
- **THEN** the ticket stays in `review` and the page asks for a reason

#### Scenario: Deliver from the wrong status

- **WHEN** the owner tries to deliver a ticket that is in `open`
- **THEN** the system refuses and the ticket stays `open`

### Requirement: Conflict-safe claiming

Every status change SHALL succeed only if the ticket still has the status and owner the actor saw when acting. When two people claim the same ticket at the same time, exactly one claim SHALL succeed and the other person SHALL see that the ticket was just claimed, with the claimer's name.

#### Scenario: Two members claim at once

- **WHEN** 柏文 and 芭樂 both press claim on unowned T-4 in `open` at the same moment
- **THEN** T-4 is owned by exactly one of them and the other sees a message that T-4 was just claimed by that person

### Requirement: Ticket history

Every successful action SHALL record who did it, which action, the reason if any, and when, in the same database transaction as the status change. The ticket page SHALL list this history from oldest to newest.

#### Scenario: History after a rejection

- **WHEN** T-2 was filed by 巧達, claimed by 柏文, delivered, and rejected by 巧達 with the reason "手機版按鈕跑版"
- **THEN** the T-2 page shows four history entries in that order and the rejection entry shows "手機版按鈕跑版"

### Requirement: Ticket board page

The `/tickets` page SHALL show an 進行中 tab (open, in_progress, review) and an 已結案 tab (done, wontfix), and a 只看我的 filter that keeps tickets the viewer reported or owns. Each card SHALL show status, `T-n`, title, category, reporter, and owner. Opening `/tickets?t=<n>` SHALL show that ticket's detail with whose turn it is, the next step, only the action buttons the viewer is allowed to use, the description, and the history.

#### Scenario: Viewer sees only allowed buttons

- **WHEN** a member who is neither reporter nor owner opens a ticket in `review`
- **THEN** no accept or reject button is shown

#### Scenario: Filter to my tickets

- **WHEN** a member turns on 只看我的
- **THEN** only tickets the member reported or owns are listed

### Requirement: Kickoff prompt

The ticket page SHALL offer a 複製開工指令 button to the owner and to admins. The copied text SHALL name the ticket as `T-<n>` with its title, category, and reporter; SHALL tell the reader to first read `COLLABORATION.md` at the repository root and follow it; SHALL name the branch `feat/T-<n>-<short-name>`; SHALL say to stop and let the operator confirm before pushing and opening a PR titled `fix(T-<n>): ...`; SHALL say not to merge the PR; SHALL say to come back to `/tickets?t=<n>` and press 交付 after Jesse merges and deploys; and SHALL include the full ticket description. The kickoff text SHALL NOT restate rules that belong to `COLLABORATION.md`, such as environment keys, migration commands, or staging commands.

#### Scenario: Owner copies the kickoff prompt

- **WHEN** the owner of T-9 titled 「財務頁加匯出按鈕」 presses 複製開工指令
- **THEN** the clipboard holds text containing `T-9`, 「財務頁加匯出按鈕」, `COLLABORATION.md`, `feat/T-9-`, `fix(T-9)`, and the ticket description

#### Scenario: Rules are not copied into the prompt

- **WHEN** the kickoff text is generated for any ticket
- **THEN** it does not contain `db:migrate`, `.env.local`, `SUPABASE_`, or `git add`
