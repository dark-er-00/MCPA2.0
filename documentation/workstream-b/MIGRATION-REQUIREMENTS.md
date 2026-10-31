# Migration review and rollout requirements

The migration is **unapplied**. No production SQL, live record operation, deploy,
commit, push or merge was performed. The feature branch starts at
`251940a832a4c69e5402420e71a396feeaf025c5`; Workstream A's agreed baseline commit
has been requested and remains pending. Compare that commit with this branch's
starting point before integrating. Existing untracked `docs/` was untouched.

1. Review `DEPLOYMENT-PREFLIGHT.sql` against a disposable clone, then the proposed
   target through the deployment owner's authorized process. Required existing
   structures are authenticated movement/recipient gateways, the verified
   inventory migration, configured Office returns, monitoring notifications,
   profiles/equipment/sites and Supabase Storage. No project/site/profile seed
   or Office UUID is introduced. No Workstream A table is required.
2. Review both workstreams' SQL together. The private engine fingerprint must
   match the reviewed verified-inventory implementation (optional purpose is
   normalized). Unknown function drift and unsafe gateway privileges fail
   closed. The existing engine/gateways and RLS policies are never replaced.
   Confirm existing `DISPOSED` is a valid terminal equipment status and that
   physically identified assets have quantity one and an accepted tracking type.
   The new transfer-join guard also rejects aggregate rows through legacy release
   and transfer RPCs; coordinate Workstream A's physical allocation before cutover.
3. Apply to a disposable Supabase environment first. Run real Storage uploads,
   MIME/size enforcement, signed-link expiry, role changes, PostgREST schema
   discovery and two independent PostgreSQL-session races. Local PGlite tests
   exercise SQL, RLS, stale state and replay, but cannot establish multi-session
   contention or real service behavior. No native PostgreSQL server/psql was
   available in this workspace.
4. Mount and test the isolated UI through the shared-file integration owner.
   Plan a coordinated cutover: after this migration, new legacy `createReturn`
   insertions deliberately fail, preventing a bypass of Admin inspection.
   Historical return operation retries continue normally. Do not apply the SQL
   while leaving the old return form as the only user-facing return flow.
5. Two distinct active Admin accounts are required to propose and approve
   retirements. No active-custody exception or single-Admin bypass exists. Confirm
   the organization accepts this explicit approval model before rollout.
6. Apply `202610250002_custody_lifecycle.sql` once through reviewed migration
   history. It is transactional and collision-sensitive; reapplication fails
   atomically rather than adopting unknown existing structures or buckets.
   No automatic live application is part of this workstream.

## Concurrency acceptance before deployment

On a disposable native PostgreSQL/Supabase instance, authenticate two independent
connections. Submit the same held Asset ID in two distinct operations at once:
exactly one should commit; the other should fail and retain the winning
reservation. Repeat with two Admin inspections of one unresolved return item,
then with a retirement approval racing a new request/reservation. Repeat the
winning UUID/payload and verify the saved result replays without new events.
Use distinct profiles for the losing-recipient attempt and verify authorization
denial. Keep the existing shared advisory lock and consistent equipment row-lock
ordering. These are required rollout tests, not results claimed by this report.

## Rollback policy

Never drop evidence/history or rewrite existing return records to roll back a UI
release. A disabled feature can leave new return entry temporarily unavailable;
it must not restore automatic finalization. Review a forward corrective migration
with the integration owner. Once B records exist, dropping the schema or deleting
reservations is a business-data migration requiring a separate plan.
