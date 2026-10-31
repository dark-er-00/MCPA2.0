# Native PostgreSQL concurrency verification

Date: 24 October 2026. This verification uses native PostgreSQL server processes and independent native `psql` connections, **not PGlite**. The supplied hardened migration was applied only to fresh disposable local clusters. No live Supabase connection, production credential, production SQL, commit, push, deployment or stash deletion was used.

## Result and environment

**Final result: 14 scenarios passed, 0 failed.** The exact counters, backend PIDs, lock observations, version and timestamps are in the ignored `results.json` and `run-final.log` beside this report. Expected authorization, invalid-row and timeout errors count as passes only when their exact SQLSTATE, rollback and recovery assertions succeed.

- Server: **PostgreSQL 17.11 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit**.
- Host: Windows `10.0.26200`, x64; Node `v24.21.0`.
- Distribution: official EDB portable Windows binary ZIP, linked by the [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/) and [EDB binary distribution page](https://www.enterprisedb.com/download-postgresql-binaries).
- Archive URL: `https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip`.
- Archive size: `341325378` bytes. Locally measured SHA-256: `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`. This records downloaded-byte provenance, not an independently verified publisher checksum/signature; the extracted server executable reports no Authenticode signature.
- Tested migration: `supabase/migrations/202610240001_equipment_import.sql`, SHA-256 `f0dbf8e1fcce79fa79c74cf008076c68d85eb24babdca20a479fbfd6a8b6060a` for the current on-disk bytes. It includes the NULL-safe Admin role check and explicit missing Office identity guard.
- Default isolation: **READ COMMITTED**. A separate REPEATABLE READ test intentionally checks stale-snapshot failure and recovery.
- Each run creates a new random temporary data directory, random available TCP port, random database named `mcpa_import_disposable_<uuid>`, and newly generated local-only SCRAM password for `mcpa_test_owner`. The server binds only `127.0.0.1`. No PostgreSQL Windows service or global installation is created.
- The runner ignores inherited PostgreSQL/database/Supabase connection environment variables and accepts only a native binary directory, never a database URL or an existing target database. It checks the connected server's data directory against its freshly created cluster. Test connections switch to the real `authenticated` or `anon` role; an assertion confirms the client role has `rolbypassrls=false`.

## Fixture and migration boundaries

`tests/equipment-import.postgres-concurrency.cjs` builds the same required equipment/profile/auth/site table contract used by the existing isolated tests, directly in native PostgreSQL. It loads the actual repository Sites, Consumables, movement, authenticated-access, account-management, recipient-identity, development-account function, Engineer portal, Office-return, Office-default and equipment-photo compatibility SQL. It supplies synthetic local profiles/Auth subjects, a verified fixture Office, a pre-existing held asset and a pre-existing linked photo. Supabase Storage is represented by local bucket/object metadata tables with the actual photo RLS/helper/trigger SQL; no Storage or Auth HTTP service is contacted.

The Office-return migration's pinned UUID is substituted **only in the disposable fixture setup**, following the existing isolated fixture approach. The Equipment Import migration is loaded from its actual file without transformation. Before applying it, the runner asserts that its RPC and receipt table are absent. It then proves that existing inventory, custody and photo metadata are unchanged and existing trigger definitions are preserved.

The installed equipment triggers are exactly:

```text
mcpa_equipment_asset_id
mcpa_equipment_photo_guard
mcpa_new_equipment_office
```

Custody in these repository definitions is protected through authenticated role/column privileges, RLS and the approved movement functions. No fictional custody trigger is added. The tests exercise those protections and the full request/release/receipt/return path with the real functions. Compatibility with unspecified extra live triggers is not asserted beyond the user's separately confirmed schema review.

## Concurrency and correctness scenarios

| Scenario | Required and observed result |
| --- | --- |
| 1. Fresh migration installation | Import objects absent initially; current migration installs; existing held/photo assets and prior trigger definitions remain unchanged. |
| 2. Concurrent manual and batch registrations | An open manual transaction holds the common allocator lock. Two manual connections and two 25-row import connections are observed blocked at once. All four have distinct PostgreSQL backend PIDs and actual blocking backend references. Releasing the holder creates 53 records total, including the holder. One waiter uses the current browser-style explicit `T-` tag, which is preserved; others use the server allocator. Mixed Individual quantity 1 and Bulk quantity 5/Pieces retain one record per row. All tags are distinct. |
| 3. Same-operation simultaneous retries | A leader imports seven rows while retaining its transaction. Four independent waiters use the same operation/payload and block on its operation advisory lock. After commit they all return the same original receipt; exactly seven records and one receipt exist. |
| 4. Distinct simultaneous operations | Three operation IDs concurrently create ten same-name/brand tools each: 30 separate records, 30 different tags and three receipts. No name merge or overwrite occurs. |
| 5. Invalid later row | A valid first row followed by an invalid row raises `22023` with the source row. Inventory, movements, storage and receipts match the complete before snapshot. Correcting the data and retrying the same operation succeeds. |
| 6. Authorization and custody protection | Engineer, Architect, Tool Handler, Secretary, inactive and anonymous import calls fail with `42501` and no changes. Direct forged project/holder/status inserts and custody-column updates are rejected. The application-role client does not bypass RLS. |
| 7. Photo and Office triggers | A pre-uploaded local photo object can be linked by authorized manual registration; its proposed tag is retained and Office/no-holder defaults remain correct. A missing photo object and an import attempting an unsupported photo field fail with no partial changes. |
| 8. Normal custody lifecycle | An imported asset completes real request, Admin approval/release, tested receipt, and inspected return. It ends AVAILABLE at the canonical Office without a holder. |
| 9. Allocator lock timeout | Holding the allocator lock causes a 250 ms import lock timeout, wrapped by its row error as `22023`; manual insert returns `55P03`. Both roll back completely. Releasing the holder and retrying the same import operation creates exactly one batch; replay returns its receipt. |
| 10. Operation lock timeout | A waiter times out with `55P03` while the leader holds its operation. Before leader commit, no uncommitted rows/receipt leak into other sessions. After commit, retry returns the leader's result; exactly three assets and one receipt exist. |
| 11. Statement timeout | A 250 ms statement timeout during allocator contention returns `57014`; no inventory/receipt change is visible. Retry after releasing the lock succeeds. |
| 12. Disconnected transaction | The leader's own `psql` process is terminated before commit while another connection is observed blocked. PostgreSQL rolls the disconnected transaction back, releases the locks, and the waiter creates exactly four records and one receipt. |
| 13. REPEATABLE READ stale snapshot | A waiter starts with an older snapshot and waits for a leader's operation lock. After the leader commits, the waiter fails safely with a uniqueness/serialization conflict rather than duplicating committed assets. On this tested PostgreSQL version the actual code is recorded in `results.json`. A fresh transaction retry returns the original committed receipt. |
| 14. Final integrity | All asset tags are unique; every receipt UUID/tag pair points to the real equipment row; original custody/photo records remain unchanged; no backend remains waiting on a lock. |

Connection overlap is established by `pg_stat_activity.wait_event_type='Lock'`, observed advisory waits, `pg_blocking_pids(pid)` and distinct backend PIDs while a leader transaction remains open. This does not rely on merely starting JavaScript promises or sequentially submitting queries to one session.

## Commands used

Initial availability checks found no installed `postgres`, `pg_ctl`, `initdb`, `psql`, Docker or Podman, and `wsl --list --quiet` reported that WSL is not installed. The real environment was therefore provisioned as a temporary portable runtime rather than declaring PGlite concurrency sufficient.

The download and extraction used PowerShell, Windows `curl.exe` and `tar.exe`:

```powershell
$pgTaskRoot=Join-Path ([IO.Path]::GetTempPath()) ('mcpa-pg-concurrency-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $pgTaskRoot
curl.exe --fail --location --connect-timeout 20 --max-time 180 --output (Join-Path $pgTaskRoot 'postgresql.zip') 'https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip'
tar.exe -xf (Join-Path $pgTaskRoot 'postgresql.zip') -C $pgTaskRoot pgsql/bin pgsql/lib pgsql/share
& (Join-Path $pgTaskRoot 'pgsql/bin/postgres.exe') --version
Get-FileHash -LiteralPath (Join-Path $pgTaskRoot 'postgresql.zip') -Algorithm SHA256
node tests/equipment-import.postgres-concurrency.cjs (Join-Path $pgTaskRoot 'pgsql/bin')
node --check tests/equipment-import.postgres-concurrency.cjs
git diff HEAD --check
git ls-files -u
git rev-parse HEAD
git rev-parse 'stash@{0}'
```

The actual temporary runtime directory is saved in the ignored parent `postgres-runtime-path.log`. Native process startup required execution outside the process sandbox after `pg_ctl` reported restricted-token error 87 in the sandbox. The permitted rerun used the same isolated-cluster design. An initial harness snapshot incorrectly queried the new receipt table before migration; that test setup was corrected to snapshot only pre-existing equipment/storage, then the entire suite was rerun. Mixed tracking-type assertions, an explicit browser-style tag under contention and exact isolation SQLSTATE capture were also added and rerun. No migration/application correction was necessary.

The runner invokes native programs directly with argument arrays (`windowsHide=true`), including:

```text
initdb -D <fresh-temp-data> -U mcpa_test_owner --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=<local-generated-password-file>
pg_ctl -D <fresh-temp-data> -l <temp-server.log> -w -t 15 start
psql -X --no-password --quiet --no-align --tuples-only --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose --host=127.0.0.1 --port=<random-port> --username=mcpa_test_owner --dbname=<fresh-disposable-db>
pg_ctl -D <fresh-temp-data> -m fast -w -t 15 stop
```

The password is passed only through the generated local password file and child-process `PGPASSWORD`, never logged or taken from project credentials. Configurations explicitly bind loopback and enable lock-wait logging. Test roles execute in separate sessions using `SET LOCAL ROLE` and synthetic `request.jwt.claim.sub`, matching the SQL identity boundary used by the existing local fixtures. JWT-signature verification by Supabase Auth is outside this database-only test.

## Changes and remaining risks

New files only for this task:

- `tests/equipment-import.postgres-concurrency.cjs` — reusable real PostgreSQL fixture and concurrency runner.
- `documentation/equipment-import-2026-10-24/postgres-concurrency/.gitignore` — excludes generated JSON and logs.
- This report. Runtime path, test logs, result JSON and server data/binaries are generated ignored/temporary artifacts.

The migration, frontend, existing tests, teammate changes and existing Git index remain untouched. The original stash is preserved. Successfully started clusters are stopped in `finally`, including failed setup runs. Temporary data/binaries remain available for review and are not installed as a service or staged in Git.

Remaining limits:

- The verified normal RPC isolation is READ COMMITTED. Under REPEATABLE READ, the stale-snapshot scenario can return `23505` rather than a receipt on the waiting request; all its work rolls back, and a new transaction retry with the **same operation ID** recovers the original receipt. Do not interpret that response as permission to start a different logical import. This run does not establish seamless receipt-return behavior at every isolation level.
- The shared advisory lock serializes equipment INSERT transactions. Long-lived manual/import transactions can block others. Timeouts and recovery are verified; no high-volume throughput benchmark or unbounded contention guarantee is claimed.
- Tests cover four concurrent blocked writers/retries, batches up to 25 rows in each contender, both tracking types, and the actual repository triggers/functions. They do not simulate all 500-row uploads or unspecified custom live triggers.
- Supabase connection pooling, PostgREST/cloud timeout limits, Auth/Storage HTTP services, network infrastructure and the precise live PostgreSQL version/extensions remain platform-specific checks. The live schema review supplied by the user was not repeated against production.
- No production migration or deployment was performed. This report removes the earlier lack of real multi-connection evidence for the tested environment; it does not authorize deployment.

## Final recorded run

Final run: **24 October 2026, 20:46:14.936–20:47:08.935 Asia/Manila** (54 seconds including fixture provisioning and shutdown).

- Database: `mcpa_import_disposable_52e5c76c7d924a2cbbd8f8189655fcfa`.
- Address: `127.0.0.1:62030`.
- Temporary cluster: `C:\Users\maeko\AppData\Local\Temp\mcpa-native-pg-OfpVkx\data`.
- Mixed-writer PostgreSQL backend PIDs: `5628`, `16624`, `10088`, `5024`; all were observed waiting on advisory locks while the holder remained open. Their blocking graph is retained in `results.json`.
- Same-operation retry waiter PIDs: `19308`, `15568`, `15780`, `16780`; one seven-record import and one receipt resulted.
- Final equipment rows: **108**, with **108 distinct Asset IDs**. These comprise two original legacy-tag fixtures and **106 new records in the existing `T-[A-F0-9]{16}` format**.
- Completed import receipts: **13**; mismatched/missing receipt UUID/tag references: **0**.
- Pending lock waiters at end: **0**.
- REPEATABLE READ stale-snapshot SQLSTATE: **23505**. Its extra work rolled back; a fresh same-operation transaction retrieved the leader's receipt without creating another asset or receipt.
- **Shutdown verified:** `pg_ctl stop -m fast -w` succeeded; the cluster's `postmaster.pid` was absent; a new TCP attempt to its recorded loopback port returned `ECONNREFUSED`.
- `node --check tests/equipment-import.postgres-concurrency.cjs` and `git diff HEAD --check` passed. No unmerged Git paths exist. No new files were staged, committed or pushed.
- HEAD remains `82448632e47f747b88a549a0def302e202281100`; `stash@{0}` remains `498e0e7a8d8cc7a8d119148646c2c5025bf2e868`.

The real PostgreSQL environment was successfully provisioned, so this final verification is **not blocked**. The sandbox-startup and initial fixture-query attempts were setup failures, not passed migration scenarios; the corrected final suite ran all fourteen scenarios in a fresh cluster and finished with no failed assertions.
