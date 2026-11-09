# claude-ticket-tools Specification

## Purpose

Let each troupe member connect their own Claude to the platform through an installable plugin, so Claude can file and work dev tickets on that member's behalf with the same rules as the web page, using a revocable key that reaches nothing but the dev ticket API.

## Requirements

### Requirement: Link code issuance

An approved `admin` or `member` SHALL be able to generate a link code from the 我的 page. A link code SHALL have the form `jk_link_` followed by 24 hexadecimal characters, SHALL expire 10 minutes after it is generated, and SHALL be usable once. Generating a new code SHALL invalidate that person's earlier unused codes. The database SHALL store only a SHA-256 hash of the code. A `finance_partner` SHALL NOT see the link section and SHALL NOT be able to generate a code.

#### Scenario: Member generates a code

- **WHEN** an approved member presses 產生連結碼 on the 我的 page
- **THEN** the page shows a code starting with `jk_link_`, its expiry time, and the sentence 「連結看我笑話，代碼 <code>」 ready to copy, and the database holds only the hash of that code

#### Scenario: New code replaces the old one

- **WHEN** a member generates code A and then code B before using A
- **THEN** exchanging A fails and exchanging B succeeds

---
### Requirement: Link exchange

`POST /api/claude/link` with a valid unused unexpired code and a device name SHALL return a new key of the form `jk_cl_` followed by 64 hexadecimal characters and the member's display name, SHALL mark the code used, and SHALL store only the SHA-256 hash of the key with the device name. An unknown, expired, or already used code SHALL return 400 with a Chinese reason and SHALL NOT create a key.

##### Example: code states

| Code state | Response |
| ---------- | -------- |
| unused, 3 minutes old | 200 with key and name |
| unused, 11 minutes old | 400 「連結碼已過期，請到平台重新產生」 |
| already used once | 400 「連結碼已經用過，請到平台重新產生」 |
| never issued | 400 「連結碼不正確」 |

#### Scenario: Code used twice

- **WHEN** a code is exchanged successfully and the same code is sent again
- **THEN** the second request returns 400 and no second key exists

---
### Requirement: Key scope and authentication

Every `/api/claude/*` endpoint except `link` and `version` SHALL authenticate only by `Authorization: Bearer <key>` and SHALL ignore the browser session cookie. A missing, malformed, unknown, or revoked key SHALL return 401. A key whose owner is not approved or lacks dev ticket access (for example `finance_partner`) SHALL return 403. Keys SHALL NOT be accepted by any page, server action, or API outside `/api/claude/*`.

#### Scenario: Browser session alone is refused

- **WHEN** a signed-in member's browser calls `GET /api/claude/tickets` with its session cookie and no Bearer key
- **THEN** the response is 401

#### Scenario: Key cannot read finance

- **WHEN** a request to a finance page or finance API carries a valid `jk_cl_` key and no session cookie
- **THEN** the request is treated as not signed in

---
### Requirement: Key revocation

The 我的 page SHALL list the member's own linked computers with device name, link time, and last-used time, and SHALL let the member revoke each one. After revocation, every request with that key SHALL return 401. A member SHALL NOT be able to see or revoke another member's keys.

#### Scenario: Revoked key stops working

- **WHEN** a member revokes the key for 「Jesse 的 MacBook」 and Claude on that computer then lists tickets
- **THEN** the platform returns 401 and Claude shows how to link again

---
### Requirement: Ticket API parity

Through `/api/claude/*` a member SHALL be able to list tickets (active or closed, optionally only their own), read one ticket with history, allowed actions, next step, and kickoff text, file a ticket, and perform `claim`, `unclaim`, `deliver`, `accept`, `reject`, and `wontfix`. These operations SHALL apply exactly the same rules and Chinese refusal reasons as the web page, and SHALL record the key owner as reporter, actor, and history author. `edit` and `reopen` SHALL be refused with 400 「這個動作請到網頁上做」.

#### Scenario: Ticket filed through Claude belongs to the member

- **WHEN** 傑哥 files 「首頁加下一場倒數」 through the plugin
- **THEN** the 開發 page shows the new ticket with 傑哥 as reporter and a history entry 「傑哥 開票」

#### Scenario: Owner cannot accept through Claude either

- **WHEN** the owner of a ticket in `review` asks Claude to accept it
- **THEN** the API returns 400 with 「認領人不能驗收自己做的票，請回報人或管理員驗收」 and the ticket stays in `review`

---
### Requirement: Plugin tools

The `jokesonme` plugin SHALL provide the tools `whoami`, `link_account`, `list_tickets`, `get_ticket`, `create_ticket`, and `act_on_ticket`. The descriptions of `create_ticket` and `act_on_ticket` SHALL begin by requiring Claude to show the content to the user and get agreement before calling. `link_account` SHALL save the key to the local settings file with owner-only permissions. When no settings file exists or the platform returns 401, every tool except `link_account` SHALL return the same Chinese instructions for generating a link code on the 我的 page and telling Claude 「連結看我笑話，代碼 jk_link_…」.

#### Scenario: Unlinked member asks to file a ticket

- **WHEN** a member who has never linked asks Claude to file a ticket
- **THEN** Claude replies with the linking instructions and no ticket is created

---
### Requirement: Ticket filing guidance

The plugin SHALL include guidance that, when the user asks Claude to file a ticket, makes Claude ask for the four description sections, check `list_tickets` for a likely duplicate, show the full draft (title, category, description), and call `create_ticket` only after the user agrees.

#### Scenario: Draft shown before filing

- **WHEN** a member says 「幫我開一張票，行事曆週末顏色太淡」 in a folder unrelated to the platform
- **THEN** Claude shows a draft title, category, and four-section description and waits for agreement before filing
