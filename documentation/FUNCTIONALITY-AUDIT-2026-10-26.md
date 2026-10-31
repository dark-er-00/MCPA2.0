# MCPA / SiteTrace functionality audit — 26 October 2026

27 October follow-up: restored the original visible **Add Account** button/form (full name, role, Auth user ID and status), including new inactive profiles, verified linking and active account creation from an existing Auth identity. It uses existing account RPCs and remains available without the optional Edge test-account service. This restoration adds no new SQL or hosted configuration changes. Restoration validation: three account/Auth database tests and the supported desktop/mobile audit browser scenario passed, including inactive/active creation, duplicate handling, existing-profile linking, refresh persistence and operation without the Edge service.


Updated 27 October 2026: the user removed Invite User from scope. Its UI, email/link delivery, resend/retry/revoke actions, password onboarding, deployment bundle and revocation proposal have been removed. The remaining account service supports gated test accounts. Old setup callbacks are rejected; password resets remain supported.

The forward migration [202610270001_remove_user_invitations.sql](../supabase/migrations/202610270001_remove_user_invitations.sql) removes the old service RPC and invitation fields from the Admin reader. It preserves people, Auth links, historical jobs and audit records, and releases the obsolete prepared-job restriction on normal access editing/verified recovery. Historical migrations remain unchanged as deployment history. No hosted database or deployment has been changed.

## Baseline and audit method

Audited `feature/consumables-module-labels` at `e5be0a1ce0c1294a830f6f4a359f248c4553df94` (`Added My Consumables`). The working tree was clean before this task. No user changes were overwritten. The attachment contained the request text but no screenshot; the quantity defect was reproduced directly.

Before code changes, traced the current UI, router, Supabase RPCs, identity helpers, RLS, immutable issue/movement records and retirement approvals. Ran 34 existing unit/database tests successfully and the existing Engineer consumables browser scenario successfully. A direct call to the shipped frontend validator accepted both `0.002 pcs` and `1.5 pcs`, confirming the reported defect.

All database mutations during tests were confined to disposable PGlite/PostgreSQL fixtures. Browser tests block external HTTPS. No production Supabase project, Auth setting, user, stock record or migration history was changed. No commit, push, merge or deployment was performed.

## Functionality audit

| Issue | Initial status and root cause | Expected behavior and minimal action taken |
|---|---|---|
| Engineer dropdowns | Implemented and working for the audited workflows. `mcpa_wa_consumables_snapshot` supplies actual catalog rows and active, assigned sites. Categories are derived from those rows. Available Consumables requests company warehouse stock, which is not allocated to a site until issuance. | Preserved the correct data queries and dependent filters. Tested actual categories, assigned-site exclusions, category switching, preserved selections, reload, and backend rejection of an unauthorized site. My Consumables remains grouped and filterable by the issuance project. Did not invent per-project warehouse stock or new categories. |
| Disposed equipment masterlist | Partially implemented. Masterlist already reads retained equipment records; approval stores database status `DISPOSED` for both sold and disposed equipment, distinguishing them with the existing retirement `disposition`. Status dropdown and route parser omitted Sold/Disposed. The generic status matcher could not distinguish sold from disposed. | Added Sold and Disposed filters and reloadable routes. Reused retirement metadata to distinguish them; raw `DISPOSED` without a sale record remains Disposed. The existing For Repair filter now includes `UNDER_REPAIR`. Preserved equipment IDs, availability restrictions, history and second-Admin approval. No new equipment database status or duplicate inventory row. |
| My Account profile | View-only; no username field or own-profile mutation RPC. Authentication uses email and an independent company profile ID. | Added optional, unique username and display-name editing for all five active roles. Registered email is read-only. The authenticated RPC accepts only name/username, identifies the caller through Auth and does not accept a target ID, role, status or email. Header, sidebar, account menu and settings refresh after save. |
| Whole-number consumables | Confirmed bug. All unit inputs and shared/DB validation accepted three decimals, including pcs/bags/boxes. | Added matching unit classification to frontend rules and database triggers. Count-unit requests use min 1/step 1; zero is still allowed for approval or optional issuance lines. Measured units retain decimals. Requests, approvals, issuance, procurement receipts, opening/minimum stock and warehouse usage/adjustments are covered. No silent rounding or balance rewrite. |

## Implementation details

### Profile safety

Usernames are optional, normalized to lowercase and unique through a database index. They have 3–30 ASCII letters/numbers/dots/underscores/hyphens and start/end with a letter or number. Display names have 1–120 characters without control characters. Duplicate display names remain legal because they are not identity keys. Sign-in continues to use the registered email.

The new RPC locks and rechecks the caller's active company profile, modifies only its name/username, and records audit events. Auth IDs, profile IDs, roles, activation, projects, custody and historical records remain unchanged. Direct browser profile updates remain forbidden. Offline demos do not save profile changes.

### Quantities and historical records

Known count units include pcs/piece/pieces, bag(s), box(es), set(s), pair(s), roll(s), sheet(s), tube(s), pack(s), bottle(s), bundle(s), can(s), length(s), unit(s), each/ea and sack(s). Case and trailing periods are normalized for classification. kg, liters, meters and unknown measurement labels retain the existing three-decimal behavior. The tests compare browser/server classification.

New count-unit requests must be positive integers. Approval and optional issuance controls may be zero; an actual issue must be positive. Existing approval limits, active-SKU checks, stock locks, operation receipts and available-stock checks are retained. The installed business rule permits a request above current warehouse stock for later review/procurement; issuance still cannot exceed stock or approved remainder. This audit does not change that business rule.

The new database guards enforce future transactions. Existing fractional requests, balances, receipts and immutable movements are preserved verbatim. Metadata edits may retain an unchanged historical fractional minimum; changing that minimum requires a whole value. An Admin can explicitly correct a legacy fractional physical count to a whole count through the already authorized correction workflow; the correction movement may have a fractional delta because it documents that historical residue. It is never performed automatically. Rejection does not depend on approval-field validity, so legacy fractional pending requests can be rejected normally. Approved/partial legacy requests with fractional remainders need business review before release: those remainders cannot be issued under the new integer policy, and this audit does not invent an approval-adjustment permission. The preflight reports fractional request lines by status.

Engineer consumption recording still does not exist in the current consumables workflow. My Consumables continues to show **Not recorded** for consumption and explains that the recorded issuance balance does not verify remaining physical stock. This audit validates the existing warehouse usage workflow; it does not grant engineers new stock-edit permissions.

## Files modified

| File | Purpose |
|---|---|
| `1-admin/modules/masterlist/masterlist.html` | Add All Equipment, Sold and Disposed filter choices. |
| `1-admin/modules/masterlist/masterlist.js` | Map the new filters to persistent routes. |
| `js/navigation.js` | Parse Sold/Disposed routes. |
| `js/equipment-tracking.js` | Distinguish sale/disposal metadata and include Under Repair in repair filtering. |
| `1-admin/modules/settings/settings.js` | Shared own-profile form, save, validation, feedback and identity refresh. |
| `1-admin/modules/settings/settings.css` | Responsive profile form using workspace tokens. |
| `js/auth.js` | Show saved username in account menu; reject retired setup links and preserve password recovery. |
| `1-admin/modules/users/users.js` | Account list and access editing; invitation controls removed. |
| `js/display.js` | Readable username-change audit events; historical account events remain readable. |
| `js/consumables-catalog.js` | Shared frontend unit classification and input rules. |
| `js/upgrades/consumables-requests/core.js` | Validate request quantities against the registered unit. |
| `2-engr/modules/consumables-requests-v2/consumables-requests.js` | Unit-specific Engineer input attributes. |
| `1-admin/modules/consumables-usage-v2/consumables-usage.js` | Unit-specific approval/issuance validation; permit rejection independently of approval values. |
| `1-admin/modules/consumables/consumables.js` | Unit-specific warehouse opening/minimum/request/receipt/usage/correction controls and validation. |
| `supabase/functions/manage-accounts/handler.mjs` | Admin-only gated test-account service; invitation actions removed. |
| `supabase/functions/manage-accounts/index.ts` | Server-side account-service configuration. |
| `supabase/migrations/README.md` | Manual deployment notes for the remaining proposals and feature removal. |
| `tests/auth.browser.cjs` | Audit mode, isolated Edge/Auth transport, and updated legacy checks for current request-method selection and retired callback rejection. |
| `tests/admin-equipment-summary.test.cjs` | Exercise the new allowed status routes. |
| `tests/consumables-requests-v2/frontend.test.cjs` | Replace the obsolete expectation that a fractional pieces request is legal. Historical fractional analytics fixtures remain. |
| `tests/package.json` | Add `test:functionality-audit`. |

## Files added and database changes

| File | Purpose |
|---|---|
| `supabase/migrations/202610260001_self_profile.sql` | Optional username, format/unique constraints, own-profile reader and constrained authenticated update RPC. |
| `supabase/migrations/202610260002_consumable_whole_units.sql` | Private unit helper and four future-write guards; no historical-data rewrites. |
| `supabase/migrations/202610270001_remove_user_invitations.sql` | Retire invitation RPCs and reader fields; preserve identities/history and normal access editing. |
| `supabase/functionality-audit-preflight.sql` | Read-only prerequisite/RLS checks and legacy fractional-balance count. |
| `supabase/functionality-audit-verify.sql` | Read-only RPC/table permission and trigger/RLS verification. |
| `tests/functionality-audit-v2/fixture.cjs` | Apply the remaining proposals and feature removal to disposable integrated test databases. |
| `tests/functionality-audit-v2/client.test.cjs` | Count/measured input cases and retired-status matching. |
| `tests/functionality-audit-v2/database.test.cjs` | Profile permissions, quantities, preservation, dropdown/retirement scope, removal and verification scripts. |
| `tests/functionality-audit-v2/account-service.mjs` | Isolated Auth contract model: password transport and test-account creation. Never used by production. |
| `tests/functionality-audit-v2/browser-checks.cjs` | Profile, quantities, retired equipment and account UI scenarios against the real app, Edge handler and local database. |
| `documentation/FUNCTIONALITY-AUDIT-2026-10-26.md` | This audit and engineering handoff. |

**The two remaining audit migrations and the new removal migration are unapplied to hosted environments.** Do not bulk-run the historical migration directory. For feature removal, review and apply only `202610270001_remove_user_invitations.sql` against the verified target, then release the updated Edge Function and frontend. Profile and quantity migrations remain independent. The removal migration verifies its results and does not delete account data. No automatic migration runner was added.

## Feature removal validation ? 27 October 2026

- Account, Edge, Auth, development-account and audit database suites: **14 tests passed**.
- Display and audit client suites: **10 tests passed**.
- Supported audit browser scenario passed on desktop/mobile: removed invitation controls, editable account access, real local test-account creation through the Edge handler/SQL, test-account sign-in, old setup-link rejection, password reset across reload, all five profile roles, consumable quantities and retired equipment.
- Removal migration preserves profile IDs/Auth links, job rows and audit history; repeat application passes. Old RPC calls fail for anon, authenticated and service_role. Manual outputs were regenerated with invitation instructions and figure removed.
- JavaScript syntax and diff whitespace checks passed. All hosted changes remain pending.

## Original audit validation (historical)

| Test command / scenario | Result |
|---|---|
| Final `npm run test:functionality-audit` | **Passed: 45 tests, zero failures/skips, followed by all three supported browser scenarios.** Executed after the final implementation and preservation checks. |
| Phase 1: account/auth/consumable/retirement/inventory baseline | 34 tests passed before edits. |
| Phase 1: `auth.browser.cjs --engineer-consumables` | Passed before edits. |
| Targeted database, consumables frontend and existing Edge suites | 24 tests passed. |
| Catalog, inventory, navigation, status and new client/invitation suites | 48 tests passed. |
| Auth/account/development/profile/invitation/display suites | 25 tests passed. |
| Latest invitation audit-event and status-route checks | 5 tests passed. |
| Latest five-issue database suite, including read-only preflight/verification | 5 tests passed. |
| `auth.browser.cjs --functionality-audit` | Passed: dropdowns, typed fractions/native spinner, backend limits, profile persistence/duplicate handling, all five profile roles, retired discovery/reload, mixed-unit approval/issuance/rejection, invite onboarding/reuse/revocation, desktop/mobile, copy fallback and cleanup. |
| `auth.browser.cjs --combined-integration` | Passed: current equipment allocation, release, receipt, inspected returns, Admin material issuance, retirement and permissions. |
| `auth.browser.cjs --consumables-upgrade` | Passed: actual catalog filtering, fractional kg stock, archival history, procurement receipts and responsive modals across eight widths in both themes. |
| JavaScript syntax, `git diff --check`, scoped layout detector | Passed. |
| Exploratory historical `auth.browser.cjs --auth` path | **Not passed.** Its pre-integration fixture cannot populate the current unified request queue/detail reader. The earlier zero-height dropdown assertion was a stale test expectation: the Specific assets method must first be selected. That native selector check now passes at all five widths. The later legacy request-detail/return path remains incompatible with the fixture, rather than evidence of a production dropdown failure. Current integrated scenarios above passed; this historical harness was not rebuilt. |

Test counts above describe separate executed commands and overlap; they are not a sum of unique tests. Temporary Chrome artifacts were produced for desktop/mobile profile, invitation, quantity and disposal screens and inspected. Some browser runs required the existing local `MCPA_CHROME_NO_SANDBOX=1` test option on this Windows host.

Reproduce the focused supported suite from `tests`:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
npm run test:functionality-audit
```

## Remaining limitations and release risks

- Current removal checks use isolated PostgreSQL fixtures and modeled Auth; no live account, email or hosted SQL changes were made.
- Existing fractional count-unit balances remain visible and need explicit business review, not migration-time repair. Unknown unit labels retain decimals until their divisibility is deliberately classified in both frontend/server rules.
- The current request workflow intentionally permits quantities above warehouse stock for Admin review; only issuance is stock-limited. This policy was preserved.
- The optional historical Auth browser path described above still needs a separate fixture/workflow update. It is not included in the supported focused audit command.
- No changes were committed, pushed, merged, deployed or applied to production.
