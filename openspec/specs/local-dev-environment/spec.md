# local-dev-environment Specification

## Purpose

Collaborators develop the platform on their own computers against a separate development database, sign in without a LINE channel, and follow one written set of collaboration rules, so nobody needs production keys.

## Requirements

### Requirement: Development sign-in shortcut

The system SHALL provide `GET /api/dev/login?as=<userId>&next=<path>` that signs the browser in as an existing approved user and redirects to a safe in-app path. The route SHALL work only when all three hold: `NODE_ENV` is not `production`, `DEV_LOGIN` is `1`, and `JK_ENV` is `development`. In every other case the route SHALL respond 404 without explaining why. It SHALL refuse unknown or unapproved users.

##### Example: enablement conditions

| NODE_ENV | DEV_LOGIN | JK_ENV | Route |
| -------- | --------- | ------ | ----- |
| development | 1 | development | enabled |
| production | 1 | development | 404 |
| development | (unset) | development | 404 |
| development | 1 | (unset) | 404 |

#### Scenario: Sign in as the seeded member locally

- **WHEN** a collaborator with `DEV_LOGIN=1` and `JK_ENV=development` runs the dev server and opens `/api/dev/login?as=dev-member&next=/tickets`
- **THEN** the browser receives a session for `dev-member` and lands on `/tickets`

#### Scenario: Shortcut is absent in production

- **WHEN** anyone opens `/api/dev/login?as=dev-admin` on the deployed site
- **THEN** the response is 404 and no session cookie is set

---
### Requirement: Development seed data

The project SHALL provide a seed command that writes fixed fake data into the development database: approved users `dev-admin` (admin), `dev-member` (member), `dev-finance` (finance_partner), and two sample dev tickets. The command SHALL run only when `JK_ENV` is `development`, SHALL only insert or update rows with those fixed ids, and SHALL never delete rows.

#### Scenario: Seed refuses without the development marker

- **WHEN** someone runs the seed command with an environment file that has no `JK_ENV=development`
- **THEN** the command writes nothing, prints that it only runs against a development database, and exits with a non-zero code

#### Scenario: Seeding twice is harmless

- **WHEN** the seed command runs twice against the development database
- **THEN** there is still exactly one row for each seeded user and sample ticket

---
### Requirement: Collaboration guide

The repository root SHALL contain `COLLABORATION.md`, the single source of development rules. It SHALL cover: where the code lives (GitHub organization `jokesonme-studio`, team `dev`); the never-do list (no push to `main`, no self-merge, no production keys or production database, no deploys); setting up a development environment with a separate Supabase project and `platform/.env.example`; branch and commit conventions; when to write a Spectra proposal; self-checks before a PR (`npm run test`, `npm run test:db`, `npm run typecheck`, `npm run lint`); the PR checklist; following the `brand-design-system` spec; and how ticket delivery works. `platform/.env.example` SHALL list every variable the platform reads, with empty values and a short Chinese comment.

#### Scenario: New collaborator sets up from the guide

- **WHEN** a collaborator follows `COLLABORATION.md` from a fresh clone with a development Supabase project
- **THEN** they can run migrations on the development database, seed it, start the dev server, and sign in through the development shortcut without any production key
