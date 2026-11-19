## ADDED Requirements

### Requirement: Live vote pages served by the platform

The platform SHALL serve the live-vote stage page at `/live-vote/index.html` and the audience page at `/live-vote/vote.html` as static files under `platform/public/live-vote/`, byte-identical to the files they were copied from. Neither page SHALL require a platform session, LINE login, or LINE friendship.

#### Scenario: Audience opens the vote page without signing in

- **WHEN** a browser with no platform session opens `/live-vote/vote.html`
- **THEN** the audience page loads and shows the two teams for the current round

#### Scenario: Stage QR points at the platform

- **WHEN** the stage page is opened at `https://jokesonme.jesse-chen.workers.dev/live-vote/index.html`
- **THEN** its QR code encodes `https://jokesonme.jesse-chen.workers.dev/live-vote/vote.html`

### Requirement: Shared live vote assets served by the platform

The platform SHALL serve `platform/public/love-improv/vendor/qrcode.js` and every portrait under `platform/public/love-improv/profiles/thumbs/` so that the relative paths `../love-improv/vendor/qrcode.js` and `../love-improv/profiles/thumbs/<name>.jpg` used by the live-vote pages and stored in the live room resolve on the platform domain.

#### Scenario: Stored portrait path resolves

- **WHEN** the live room snapshot lists a member avatar `../love-improv/profiles/thumbs/傑哥.jpg` and the stage page is opened on the platform
- **THEN** the portrait loads from `/love-improv/profiles/thumbs/傑哥.jpg` with status 200

### Requirement: External live vote backend contract

The live-vote pages SHALL talk directly from the browser to the external Supabase project configured in `platform/public/live-vote/config.mjs`, calling only the public RPCs `jlv_live_state`, `jlv_live_vote`, `jlv_live_command`, and `jlv_live_history`. The platform SHALL NOT add migrations, tables, or functions for live voting. The RPC names and parameters SHALL be the interface between the platform front end and the backend; a backend change that alters them SHALL be accompanied by a front-end change.

#### Scenario: No platform database objects for live voting

- **WHEN** the change is applied
- **THEN** `platform/supabase/migrations/` contains no new migration and no platform code references `jlv_live_`

### Requirement: Toolbox entry to the stage page

The toolbox card 看我笑話現場投票 SHALL link to `https://jokesonme.jesse-chen.workers.dev/live-vote/index.html` once this change is deployed. Placing the entry behind the signed-in toolbox SHALL NOT be described as access control, because the backend control RPC remains public.

#### Scenario: Member opens the stage from the toolbox

- **WHEN** a member clicks 看我笑話現場投票 on `/tools` after deployment
- **THEN** a new tab opens the platform stage page
