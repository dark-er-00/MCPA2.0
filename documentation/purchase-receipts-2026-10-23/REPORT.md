# Purchase Receipts compatibility report

23 October 2026 · Asia/Manila · branch `Updated-MCPARole`

Prepared a receipts-only, manual compatibility migration. Existing uncommitted
Consumables/catalog/archive work is preserved. Equipment Photo SQL, purchase
ledger SQL and the historical combined Storage SQL remain unchanged. No production
SQL, object/record mutations, history repair, commit, push, pull, checkout, merge
or reset was performed. The old combined Storage migration was **not executed**.

## Result

`202610230001` was unused when inspected. The new migration installs only the
private `purchase-receipts` bucket (10,485,760 bytes; PDF/JPEG/PNG/WebP), the existing
receipt helper contract `(text) → boolean`, authenticated SELECT/INSERT policies,
restricted helper execution and its provenance comments. It adds no general
UPDATE/DELETE policy or Storage table grants. Receipt names remain
`<purchase UUID>/<new object UUID>.<pdf|jpg|png|webp>`.

The helper verifies the existing active profile identity and Admin/Secretary role.
It supports staged uploads before purchase creation and company-wide authorized
receipt reads. The unchanged frontend uploads with `upsert:false`, retains prior
objects on replacement and requests 300-second signed URLs. No frontend product
code needed modification for this task.

The guard checks actual RLS on objects/buckets, normal browser roles (including
anonymous/authenticated membership), known helper signatures/security settings/
active-account bodies, existing receipt bucket/settings/objects, any existing receipt
helper overload/definition or named policy, and all browser-applicable object
policies (PUBLIC and inherited roles included). Only the exact known equipment
read/insert/discard predicates are accepted; names or comments alone are insufficient.
Browser bucket mutation policies stop installation because they could publicize or
relax receipt settings. Unknown rules are left untouched and require review.

This is a **once-only clean install**, not a script that silently adopts or replaces
existing artifacts. Even a compatible existing receipt bucket/helper stops it for
deployment/history review. Every failure is transactional. No equipment bucket,
policy, helper, cleanup function, guard trigger, image column or equipment RLS is
changed. The legitimate equipment-only cleanup DELETE policy remains intact.

## Integration and deployment

The historical ledger's executable prerequisites are the identity helper,
`consumable_requests` and real `storage.objects`. Its comment naming the old combined
Storage migration is historical guidance, not a hard code dependency. The new
scoped receipt setup satisfies the required storage contract without that migration.

Exact manual order, following backups and saved preflight:

1. Receipt read-only preflight; confirm deployed Equipment Photo compatibility.
2. New **202610230001 receipt storage** migration; read-only verification and real
   staging Storage API checks.
3. Existing **202610100005 purchase ledger** migration, if still absent.
4. Pending Consumables **202610220000 → 202610220001 → 202610220002** migrations.
5. Guarded sample archival → repeat catalog preflight → 126-SKU seed → verification.
6. Compatible frontend deployment and authorized smoke checks.

The later-dated receipt file must run before the earlier-dated ledger/Consumables
files. The ledger must exist before 001/002 so they install the optional snapshot
extensions and archived purchase-link protection. Tests confirm purchase/request/
history fields and receipt references survive that order unchanged; the snapshot
adds SKU/specification/archive metadata consumed by the existing frontend. No
purchase function was unnecessarily replaced by this receipt migration.

[DEPLOYMENT.md](DEPLOYMENT.md) supplies full prerequisites, conflict handling,
staging scenarios, preservation comparison, recovery and remaining live checks.
[Migration gate](../../supabase/migrations/README.md) prohibits blind chronological
replay and false history entries. The original combined migration is retained for
provenance, not automatically rerun or marked applied. No automated deployment
workflow was found; any future baseline/history reconciliation needs separate review.

## Verification

All completed runs passed. Counts overlap and are reported per run.

| Check | Passed | Failed | Evidence |
|---|---:|---:|---|
| Receipt + ledger + archive + catalog database suites | 28 tests | 0 | [database-tests.log](database-tests.log) |
| Final scoped storage guard/preservation suite | 7 tests | 0 | [final-storage-tests.log](final-storage-tests.log) |
| Existing Equipment Photo tests selected without historical combined SQL execution | 2 tests | 0 | [equipment-regression-tests.log](equipment-regression-tests.log) |
| Existing feature browser checks using split Storage migrations | 3 workflow groups plus summary | 0 | [browser-tests.log](browser-tests.log) |
| Consumables/archive browser checks using split Storage migrations | 8 reported groups | 0 | [consumables-browser-tests.log](consumables-browser-tests.log) |

Database tests compare complete Equipment Photo pre/post baselines, including
bucket contents/settings, policy OIDs/definitions, helper/guard OIDs and definitions,
trigger, image-column ACL/type, equipment RLS/policies, existing image values and
stored objects. They also preserve unrelated bucket objects/service-only policies,
equipment/stock/request/profile/movement rows, verify linked-photo protection and
unlinked cleanup, deny invalid/anonymous/field/inactive receipt access, and block
receipt update/delete/overwrite. Unsafe policy/helper/bucket/role cases fail closed
without replacing existing rules. The final storage run checks the latest preflight/
verification baselines and the strengthened role/policy guards.

The browser transport is mocked locally over isolated PostgreSQL; it exercises
the real frontend upload/save/read/failure/retry flow, company role restrictions,
receipt history and archive/responsive behaviors. It **does not prove the live
Supabase Storage service accepts actual bytes or issues working signed URLs**.
SQL tests enforce row authorization but bucket MIME/size and signed URLs require
the separately documented approved staging API tests. External HTTPS is blocked.

Commands executed from repository root:

```powershell
node --test --test-concurrency=1 tests/purchase-receipts-compatibility.test.cjs tests/purchase-ledger.test.cjs tests/consumables-archive.test.cjs tests/consumables-upgrade.test.cjs
node --test tests/purchase-receipts-compatibility.test.cjs
node --test --test-name-pattern='equipment-only setup|alternate photo fields' tests/equipment-photos-compatibility.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
$env:MCPA_SKIP_SCREENSHOTS='1'
node tests/auth.browser.cjs --feature-completion
node tests/auth.browser.cjs --consumables-upgrade
git diff --check
```

The historical equipment test that runs combined feature storage was deliberately
excluded by test-name selection; it remains preserved. Relevant ledger/archive/
browser fixtures now use photo compatibility → receipt compatibility → ledger,
never executing the old combined migration. The new `test:purchase-receipts`
package script groups the key database and browser commands for future runs.

## Exact files for this task

Created:

- `supabase/migrations/202610230001_purchase_receipts_compatibility.sql`
- `supabase/purchase-receipts-preflight.sql`
- `supabase/purchase-receipts-verification.sql`
- `supabase/migrations/README.md`
- `tests/purchase-receipts-fixture.cjs`
- `tests/purchase-receipts-compatibility.test.cjs`
- `documentation/purchase-receipts-2026-10-23/DEPLOYMENT.md`
- `documentation/purchase-receipts-2026-10-23/REPORT.md`
- `documentation/purchase-receipts-2026-10-23/database-tests.log`
- `documentation/purchase-receipts-2026-10-23/final-storage-tests.log`
- `documentation/purchase-receipts-2026-10-23/equipment-regression-tests.log`
- `documentation/purchase-receipts-2026-10-23/browser-tests.log`
- `documentation/purchase-receipts-2026-10-23/consumables-browser-tests.log`

Updated while preserving their existing changes:

- `tests/auth.browser.cjs` — split Storage fixture dependency order and bucket RLS.
- `tests/consumables-upgrade-fixture.cjs` — split storage before ledger, bucket RLS.
- `tests/purchase-ledger.test.cjs` — same reviewed storage order in ledger fixture.
- `tests/package.json` — dedicated receipt compatibility test entry point.
- `documentation/consumables-upgrade-2026-10-22/DEPLOYMENT.md` — receipt/ledger prerequisite.
- `documentation/consumables-upgrade-2026-10-22/ARCHIVE-COMPATIBILITY.md` — same prerequisite.
- `documentation/consumables-upgrade-2026-10-22/FILES.md` — full uncommitted file inventory.

Remaining manual prerequisites: confirm live migration history, exact auth/security
definitions, Storage RLS/service grants and policy memberships, absence of partial
receipt/ledger objects, unchanged equipment baseline, and real staging API upload/
read/size/MIME/signed URL/denial behavior. If the ledger is missing but 001/002 are
already installed, prepare a separate integration follow-up rather than rerunning
them. No production deployment or migration-history repair is authorized by this work.
