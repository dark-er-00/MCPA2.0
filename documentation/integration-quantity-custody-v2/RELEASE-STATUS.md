# Release status - 25 October 2026

**NO-GO.** Locally verified correction; hosted application and acceptance blocked.
No hosted fixture mutations, production SQL, production merge or deployment.

## Fixed locally

- Forward migration 202610250004_read_rpc_authorization.sql follows integration 003.
  Adds private STABLE wa_read_actor using incumbent identity/role checks; changes
  only the authorization call in seven installed STABLE readers. Preserves all
  other function SQL, owners, settings, ACLs and mutation locking. Transactional
  guards reject unexpected prerequisites and roll back partial replacements.
- supabase/staging-read-rpc-correction.psql reuses the reviewed exact staging route
  and eight hosted fingerprints, checks them READ ONLY, then includes 004.
  Requires verify-full TLS/CA and clean connection overrides. Existing helper or
  fingerprint mismatch means STOP and inspect. Never apply both old proposal and 004.
- Integration fixture now installs 004; read-rpc.test.cjs adds focused coverage.
  Migration README records the forward correction. No runtime UI modules changed.

## Verification actually performed

| Scope | Result | Evidence / limit |
|---|---|---|
| Local read-RPC regression | PASS | Original 25006 reproduced; all seven complete corrected readers run READ ONLY. Admin/Engineer/Architect permissions, other-role/anonymous/inactive denial checked. All existing function definitions/owners/settings/ACLs compared; only seven calls change. RLS/table permissions unchanged. Late failure rolls back all replacements. |
| Local quantity/import/custody | PASS | Existing integrated import/allocation/release/acceptance/exact-ID transfer/Good return regression with 004. |
| Local returns/retirement | PASS | Existing Good/Damaged/Missing/Disputed, note scope, repair and distinct-Admin retirement regression with 004. |
| Local consumables | PASS | Existing issuance, stock replay, analytics and archive/role regression with 004. |
| Local evidence | PASS | Existing delete/overwrite retention regression with 004. Storage metadata is simulated locally. |
| Hosted fix/current state | BLOCKED | Verified-TLS connection reaches staging authentication, then fails: no password supplied. No connected browser sessions. No SQL sent; cannot determine whether someone independently installed the proposed fix. |
| Hosted A quantity; B inspection; C consumables; D lookup/transfer; E import; F retirement; G Storage | BLOCKED (each) | Authenticated staging access unavailable. No real Auth/PostgREST, concurrency or upload success claimed. |
| Physical Android camera | NOT TESTED | ADB devices -l returns no device. Reconnect/unlock/authorize phone; reuse USB reverse 4179 and test actual camera/secure-context behavior. |
| Production read-only compatibility | BLOCKED | No authenticated production database/Dashboard session. Actual history, prerequisites, Individual/Bulk/Office, open movements/returns, Auth/RLS and drift not inspected live. |
| Production backup restore readiness | BLOCKED | No database-backup path/restore evidence found in release artifacts or matching backup in Downloads. Documented Git stash backup is not database recovery. Availability/recoverability unverified; no restore/database created. |
| GitHub | PASS | Existing PR #1 open and draft, base Updated-MCPARole; both remote branches match reported baseline before correction. |

Five focused local tests passed. Prior 23 installation phases, 22 catalog checks,
accounts and failed batch were not repeated. Historical fixture counts are not
current hosted evidence. Preserve both existing project IDs and pending import
UUID in the local manifest; inspect current counts/receipt before continuation.

## Coordinated release procedure (not authorized for execution)

1. Restore authenticated staging access privately. Verify project identity,
   helper/readers and fixture/receipt counts. Apply only missing guarded 004 to
   blqlwfoserguserzmggo; check seven readers/denials through real Auth/PostgREST.
   Resume A-G individually using existing projects/operation IDs and original limits.
2. Obtain production read-only preflight and backup location/recovery evidence.
   Confirm actual migration history/prerequisites, Bulk/Individual/Office and open
   movements/legacy returns. Resolve drift explicitly. Verify backup integrity,
   required keys/roles/Storage recovery and existing authorized restore proof;
   filename existence or archive listing alone is insufficient.
3. After these gates pass, request ONE production approval. Prebuild/check the
   exact commit. Arrange an operator-enforced write pause, close old tabs, record
   outstanding movements/receipts and resolve aggregate movements that new guards
   would strand. Save the final recoverable backup/recovery point.
4. Apply only genuinely missing reviewed prerequisites, then quantity 001 ->
   custody 002 -> integration 003 -> correction 004. No wildcard replay or invented
   history. Stop on error and inspect committed phases; Pages/SQL are not atomic.
5. Retain legacy-return rejection after 002; historical receipt replays continue.
   Merge only the approved commit into Updated-MCPARole and deploy through existing
   Pages. Check version/MIME and require fresh Admin/Engineer loads before reopening
   writes. Cached old forms fail closed and require reload; never restore automatic returns.
6. Check role login/readers, movement continuity, inspection stock exclusions,
   reservation uniqueness, issuance balances, permanent IDs, dual retirement actors
   and evidence access. On failure keep affected writes paused; use a forward fix.
   Preserve all assets/movements/receipts/audit. Backup recovery must reconcile
   subsequent writes and Storage; never drop feature history as rollback.

Reproduce:

~~~powershell
node --test --test-concurrency=1 tests/integration-quantity-custody-v2/read-rpc.test.cjs
node --test --test-concurrency=1 --test-name-pattern='combined import, quantity|combined return outcomes|outward issuance, analytics|completed evidence cannot' tests/integration-quantity-custody-v2/database.test.cjs
~~~

Shortest next action: restore authenticated MCPA Staging access privately, then
verify hosted state and apply only the missing guarded correction. Do not send
credentials in chat. Production approval is not requested while NO-GO.
