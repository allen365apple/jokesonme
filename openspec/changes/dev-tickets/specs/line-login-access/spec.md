## MODIFIED Requirements

### Requirement: Role-based page access

The system SHALL support exactly three roles: `admin`, `member`, `finance_partner`. `admin` and `member` SHALL access all pages; only `admin` SHALL access approvals, role changes, and template editing. `finance_partner` SHALL access only finance pages (transactions, settlements, advance reimbursements, analytics, forecast, cash-flow import) and SHALL NOT read todos, ideas, planning pages, captured LINE messages, or dev tickets. Enforcement SHALL happen on the server for every data request, not only by hiding navigation.

##### Example: access matrix

| Role | Todos, ideas & messages | Dev tickets | Finance pages | Approvals & templates |
| ---- | ---------------- | ----------- | ------------- | --------------------- |
| admin | yes | yes | yes | yes |
| member | yes | yes | yes | no |
| finance_partner | no | no | yes | no |

#### Scenario: Finance partner requests todos

- **WHEN** a `finance_partner` user calls the todos data endpoint directly
- **THEN** the server responds with 403 and returns no todo data

#### Scenario: Finance partner opens dev tickets

- **WHEN** a `finance_partner` user opens `/tickets` or calls a dev ticket action directly
- **THEN** the page redirects to the finance home and the action is refused without changing any ticket
