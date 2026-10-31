# Four independently reproduced integration issues — fixes

25 October 2026, Asia/Manila. The independent review returned **FAIL** for two
remaining race conditions; the other previously identified corrections passed
that review. The targeted repairs below pass local regression checks and are
ready for independent re-review. **Independent PASS has not been confirmed.**
No deployment or live database access was used. Production readiness is not
claimed. The earlier four-issue work and its validation history remain below.

## Latest follow-up: final two race conditions

Both original defects were reproduced before modifying production source.
The deterministic import test failed because the recovery token became `null`;
the deterministic refresh test failed because refresh A removed the proposal
already rendered by B. The expected failing runs are retained:

- [Import failure before the fix](final-races-import-before.log).
- [Retirement refresh failure before the fix](final-races-refresh-before.log).

### Import recovery fencing

`js/upgrades/individual-import-expansion/controller.js` now records an opaque,
unique dispatch revision whenever it persists a dispatch or definitive rejection.
Every removal rereads and compares the entire actual persisted operation,
including operation UUID, payload fingerprint, provenance, revision and current
flags. Definitive-rejection writes have the same check. A successful response
from an older dispatch cannot remove a replacement record, and an old rollback
cannot rewrite a newer uncertain dispatch.

Abandonment keeps its busy guard throughout receipt lookup, validation and final
removal. It rechecks the rejected/uncommitted state immediately before deletion;
there is no asynchronous gap between that final check and removal. Missing
receipts alone still cannot authorize abandonment of an uncertain operation.
Existing tokens without a revision remain readable; the next dispatch stamps a
new revision. Successful abandonment and intentional corrected resubmission
continue to work with a new operation UUID.

A controller owner lease per profile/Storage object prevents an older instance
from resuming writes after a newer instance becomes active. `dispose()` revokes
the old controller without modifying the journal. Persisted revisions provide
an additional fence when separate adapters access the same underlying journal.
`js/equipment-import.js` disposes controllers on modal close and mount teardown,
captures the specific controller/dialog/revision for asynchronous work, and
ignores callbacks belonging to a previous modal or screen.

The mandatory regression uses actual local SQL: reject the import, start
abandonment, capture and hold its missing-receipt response, dispose/remount,
dispatch a retry with the same UUID and `uncertain=true`, then release the old
response. The token survives. The retry then commits with its response lost;
receipt recovery returns the original operation with exactly one equipment row
and one receipt. A browser regression repeats the sequence through real modal
navigation and remounting. Six additional controller tests cover lease fencing,
independent storage adapters, late rejection/success, compatibility with old
tokens, and a newer rejection that restores the same UUID and flags but has a
different dispatch revision.

**Storage scope:** the existing journal uses `sessionStorage`, separately scoped
to each browser tab and profile. A duplicated/opened tab can inherit a copy,
which then evolves independently. One tab cannot delete another tab's current
entry. The synchronous check/removal and owner lease coordinate this document;
persisted revision checks also detect observed changes from separate adapters.
This adds no browser-wide compare-and-swap or coordination between independently
copied tab journals. Retries sharing one UUID still use the server's idempotent
receipt contract. Different UUIDs remain distinct deliberate imports; global
deduplication of spreadsheet contents across tabs is outside that contract.
These tests cover a shared journal and actual remounts, not concurrent execution
in multiple browser tabs or separate JavaScript agents.

### Retirement refresh ordering

`js/upgrades/equipment-retirement/retirement.mjs` assigns each refresh a monotonic
generation and captures the draft version. It keeps the response local until
generation, disposal, draft and Admin authorization checks pass. An outdated
success or failure cannot replace the latest snapshot or UI. It also guards
drafts when mounted independently of the integration host.

`js/integration.js` orders reads by RPC name, rejects responses from superseded
reads or ended mounts, and keeps its existing draft-version checks. A host
refresh updates its completion status only if its generation is still current,
its mount is alive and the module applied the result. Superseded responses are
ignored; a current error remains visible and leaves existing records intact.
Signed-in RPC/Storage access, role checks and listener cleanup remain intact.

The mandatory browser regression captures and holds snapshot A, creates a real
retirement proposal, captures B, releases B and verifies the proposal appears,
then releases A and verifies it remains. Additional schedules cover two pending
reads followed by a draft edit; navigation and remount with a held response;
normal refresh; a current read error and recovery; and a standalone module
without the host guard. The earlier focused suite also rechecks proposed,
approved and rejected deep links and explicit discard choices.

### Latest validation results

All final commands below exited zero with no failed or skipped tests. Suites
overlap; counts must not be added as unique tests. The two `before` logs above
are intentional failing evidence, not final-suite failures.

| Validation | Result | Evidence |
| --- | --- | --- |
| New deterministic race suite | 17 tests (16 controller + 1 SQL-backed race) and 6 browser scenario groups passed | [final-races-after.log](final-races-after.log) |
| Earlier four-issue focused suite | 6 client tests and 4 browser scenario groups passed | [final-races-prior-focused.log](final-races-prior-focused.log) |
| Extended combined integration command | 12 tests, real application-shell smoke, and 6 new browser scenario groups passed | [final-races-combined.log](final-races-combined.log) |
| Workstream A | 68 tests passed: 32 import and 36 quantity/consumables frontend/database tests | [final-races-workstream-a.log](final-races-workstream-a.log) |
| Workstream B | 25 custody/security/retirement/evidence/QR tests passed | [final-races-workstream-b.log](final-races-workstream-b.log) |
| Default application command | 69 tests, 8 movement database scenarios, and combined real-shell browser smoke passed | [final-races-default.log](final-races-default.log) |
| Syntax, whitespace and preserved Git/SQL | 28 JavaScript files parsed; integrity checks passed | [final-races-integrity.json](final-races-integrity.json), [manifest](implementation-manifest.json) |

The browser runs had no uncaught exceptions. Permissions and error paths include
non-Admin import denial, changed-account responses, known rejection, timeout,
lost committed responses, failed receipt lookup, stale callbacks and current
snapshot failure. All data was synthetic in disposable PGlite with actual SQL,
RPCs and RLS; external HTTPS was blocked. No SQL source changed. The historical
native PostgreSQL concurrency suite was not rerun for these client-only repairs.
Live Supabase, deployment and physical camera behavior remain NOT VERIFIED.

During test setup, a Chrome startup encountered Windows `EBUSY` reading its
DevTools port file and passed on rerun. The remount test helper was corrected
to start navigation without waiting for its deliberately held initial snapshot.

Reproduce the new races from the repository root:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
$env:MCPA_SKIP_SCREENSHOTS='1'
npm.cmd --prefix tests run test:final-races
npm.cmd --prefix tests run test:review-fixes
npm.cmd --prefix tests run test:combined
npm.cmd --prefix tests test
node --test --test-concurrency=1 tests/quantity-requests-v2/frontend.test.cjs tests/quantity-requests-v2/database.test.cjs tests/consumables-requests-v2/frontend.test.cjs tests/consumables-requests-v2/database.test.cjs tests/individual-import-expansion-v2/*.test.cjs
node tests/custody-lifecycle-v2/run-tests.cjs
```

The latest production changes are confined to the four requested files:
`controller.js`, `equipment-import.js`, `integration.js`, and `retirement.mjs`.
Tests add `final-races.test.cjs`, `final-races.browser-checks.cjs`, six controller
regressions, browser dispatch and package commands. The combined command now
includes the SQL-backed race and new browser schedules.

HEAD `7e1af39`, MERGE_HEAD `efc6b07`, all 29 staged B blobs, original feature
references and `Updated-MCPARole` are preserved. All repairs remain unstaged;
the merge remains pending. No staging, unstaging, commits, pushes, resets,
rebases, merge abort/completion, branch switches, SQL deployment or deployment
occurred. Previously manifested unrelated source files remain unchanged.

No known failure remains in the requested reproduction schedules or final
local suites. The tab-scoping limits above remain. Independent acceptance is
pending; these changes are ready for independent re-review.

## Earlier four-issue changes and coverage

| Issue | Fix | Regression evidence |
| --- | --- | --- |
| Late custody responses overwrite recovery journal | `api.mjs` reads the current profile journal and changes only the matching operation. Completion requires the same UUID; a definitive rollback also requires the same dispatch attempt. Active instances synchronize pending operations with the journal. Disposal no longer allows a late response to replace the journal with an empty or stale map. Existing v3 storage entries remain readable. | Four new client tests cover unrelated uncertain actions, remounted instances, a newer intentional action with the same payload, and a newer uncertain retry of the same UUID. All four failed against the previous implementation and pass after the fix. Remount/retry preserves the original unresolved UUID. |
| Rejected imports have no safe correction path | Import Tools exposes **Start a corrected import** only for a known rejected v2 operation with no earlier uncertainty. It calls the existing `abandonUncommitted()` controller method, checks the actual receipt and resets the wizard only after safe clearance. A found receipt displays the committed result. A failed lookup preserves the operation and current wizard. | Real local SQL constraint rejection imports zero records. The UI checks the missing receipt, resets, and commits the corrected file once. A simulated failed receipt lookup preserves the operation. A committed import with a lost response has no correction action across reopening and recovers its receipt without another import write. |
| In-flight automatic refresh erases a new draft | The integration adapter versions input/change events. Snapshot responses started before a later edit are rejected before module rendering, leaving the form intact and explaining that the draft was kept. The signed-in client's Storage support and mutation paths remain available through the adapter. | The browser holds `mcpa_b_snapshot`, starts a focus refresh, types a retirement reason and releases the response. The reason survives without a discard prompt. Further focus refresh is skipped while dirty. Explicit refresh respects both declining and accepting discard. |
| Approved/rejected retirement deep links stay collapsed | Every retirement record has a stable `data-retirement-record` target, independent of its forms/status. The requested record opens during list rendering and remains targeted after refresh. | Real proposed, approved and rejected records each open through `?record=...` and remain open after refresh. Only the target expands. An unknown ID opens no unrelated record. |

The earlier four-issue patch changed:

- `js/upgrades/custody-lifecycle/api.mjs`
- `js/equipment-import.js`
- `js/integration.js`
- `js/upgrades/equipment-retirement/retirement.mjs`

Test changes add client regressions and a focused real-shell browser mode in
`tests/integration-quantity-custody-v2/review-fixes.browser-checks.cjs`, dispatched
by `tests/auth.browser.cjs` and `npm.cmd --prefix tests run test:review-fixes`.

## Earlier four-issue validation

The earlier commands below exited zero, with no failed or skipped cases. Counts overlap
between suites and must not be added as unique tests.

| Validation | Result | Evidence |
| --- | --- | --- |
| Focused regression command | 6 client tests and 4 browser scenario groups passed; no uncaught browser exceptions | [four-fixes-regressions.log](four-fixes-regressions.log) |
| Combined integration command | 11 tests and both real application shells passed | [four-fixes-combined-tests.log](four-fixes-combined-tests.log) |
| Individual import expansion | 26 unit/controller/database/view tests passed | [four-fixes-import-tests.log](four-fixes-import-tests.log) |
| Quantity and consumables requests | 36 frontend/database tests passed | [four-fixes-request-tests.log](four-fixes-request-tests.log) |
| Custody, retirement, evidence and QR | 25 tests passed | [four-fixes-custody-tests.log](four-fixes-custody-tests.log) |
| Default npm test | 69 tests, 8 movement database scenarios, and combined application browser passed | [four-fixes-default-tests.log](four-fixes-default-tests.log) |
| Syntax | All 24 changed/new JavaScript files parsed | [implementation-manifest.json](implementation-manifest.json) |
| Whitespace and Git preservation | Passed | [implementation-manifest.json](implementation-manifest.json) |

Browser tests ran in local headless Chrome under `/MCPA/` using synthetic
accounts and disposable PGlite with the actual migrations, RPCs and RLS.
Supabase Auth/transport are fixture adapters; external HTTPS was blocked.
The constraint rejection and successful/recovered imports execute actual SQL.
The response loss and delayed snapshot are controlled transport schedules.

The new recovery action was visually inspected at desktop 1440×1000 and mobile
390×844. Its button remains visible and within the viewport; the existing footer
wraps it without a CSS change. Screenshots:
[desktop](screenshots/review-rejected-import-desktop.png),
[mobile](screenshots/review-rejected-import-mobile.png).

No SQL migration changed during this fix. The earlier native PostgreSQL
concurrency results are retained as historical evidence and were not rerun for
these client/UI changes. Physical camera hardware, a deployed Supabase instance,
and production behavior remain **NOT VERIFIED** in this follow-up.

## Reproduce

From the repository root, with existing local test dependencies:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
npm.cmd --prefix tests run test:review-fixes
npm.cmd --prefix tests run test:combined
npm.cmd --prefix tests test
node --test --test-concurrency=1 tests/individual-import-expansion-v2/*.test.cjs
node --test --test-concurrency=1 tests/quantity-requests-v2/frontend.test.cjs tests/quantity-requests-v2/database.test.cjs tests/consumables-requests-v2/frontend.test.cjs tests/consumables-requests-v2/database.test.cjs
node tests/custody-lifecycle-v2/run-tests.cjs
```

Set `MCPA_SKIP_SCREENSHOTS=1` for functional reruns that need no new captures.
PowerShell execution policy was unchanged; `npm.cmd` avoids `npm.ps1`.

## Preserved state

- Branch: `integration/quantity-custody-v2`.
- HEAD: `7e1af39e9d3be4d358dc966859bfa065b516b57f`.
- MERGE_HEAD: `efc6b07054d9701c07165c21e0d21389dcdb6ce2`.
- `Updated-MCPARole`: `251940a832a4c69e5402420e71a396feeaf025c5`.
- Exactly 29 original B entries remain staged, each matching its MERGE_HEAD
  blob. Fixes to staged B files remain unstaged working-tree changes.
- No unmerged entries. The merge remains pending. No staging, unstaging,
  commits, pushes, resets, branch switches, rebases, merge completion or
  deployment occurred.
- Original A and B SQL migrations and the prior integration migration are
  unchanged. Role checks, transaction authority, stock/custody rules and
  dual-Admin retirement approval remain enforced.

The refreshed manifest records the reviewed source hashes and follow-up
evidence. Earlier implementation logs remain available under their original
names.
