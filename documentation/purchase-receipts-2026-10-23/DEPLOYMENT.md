# Purchase receipt storage deployment

23 October 2026 · Asia/Manila · `Updated-MCPARole`. Prepared locally only. No live
SQL, objects or records were changed, and no commit/push was performed.

## Known state and prerequisites

The user reports working authenticated identity and Material Requests tables,
deployed Equipment Photo compatibility, and no purchase tables, snapshot, receipt
bucket or receipt policies. This agent did not connect to production. Reconfirm
the live state immediately before execution; missing or changed assumptions stop
the deployment.

Required: real `storage.buckets`/`storage.objects` with RLS already enabled, normal
non-bypass `anon`/`authenticated` roles, the existing private identity helper and
public role helper with reviewed active-account definitions/security settings,
and the normal Supabase Storage service privileges. Browser roles must not own or
inherit ownership of Storage tables. The migration grants no table/service/owner
permissions and does not invent a Storage service schema. The current
equipment policies must retain their reviewed bucket-scoped definitions. Any
other browser-applicable object policy (including inherited/PUBLIC policies) or
bucket mutation policy requires review. No existing access policy is removed to
make the install succeed.

Run scripts as an authorized SQL owner, in a maintenance window without concurrent
photo/bucket configuration changes. Save preflight results, backups and the actual
migration ledger before execution. If Supabase refuses owner-level operations,
stop; do not weaken security or switch to a browser key to install SQL.

## Exact dependency order

Perform the complete sequence first in an isolated staging project/copy. Production
execution remains manual and separately approved; none is performed by this task.

1. Save a backup and read-only live-state/migration-history evidence. Run
   [purchase-receipts-preflight.sql](../../supabase/purchase-receipts-preflight.sql).
   Export **every** result set, particularly `equipment_preservation_baseline`.
   Receipt bucket, helper overloads and receipt policies must be absent. Inspect
   all actual auth/helper/policy definitions rather than relying on comments.
2. Confirm `202610210001_equipment_photo_compatibility.sql` is already deployed and
   functional. **Do not rerun it** as part of receipt installation. Do not run
   `202610100003_feature_storage.sql` at any point in this deployment.
3. Review and manually execute only
   [202610230001_purchase_receipts_compatibility.sql](../../supabase/migrations/202610230001_purchase_receipts_compatibility.sql).
   It is a once-only, transaction-safe clean install. Unexpected helper signatures,
   definitions, policy predicates/grants, existing receipt objects or bucket settings
   stop it. Even an already compatible receipt installation requires reviewing its
   actual deployment/history; the migration deliberately does not replace or
   silently adopt existing artifacts. A second execution fails without replacing them.
4. Run [purchase-receipts-verification.sql](../../supabase/purchase-receipts-verification.sql).
   Expect a private `purchase-receipts` bucket, 10,485,760-byte limit, exactly
   PDF/JPEG/PNG/WebP MIME types; only authenticated receipt SELECT/INSERT policies;
   authenticated helper execution; no PUBLIC/anon helper execution; unchanged
   equipment baseline, including policy/helper/trigger OIDs and image-column ACL.
   The existing equipment-only cleanup DELETE policy remains valid and unchanged.
   Do not use the old global "no DELETE policies" assertion.
5. Run the staging Storage API scenarios below. Catalog checks establish configured
   restrictions and preservation, not actual authenticated service upload/download
   success. Do not enable production receipt uploads until these checks pass.
6. Reconfirm `mcpa_auth_private.identity()`, `public.consumable_requests` and real
   `storage.objects` exist and the purchase tables/functions are still absent. Then
   review/apply the **existing, unchanged**
   `supabase/migrations/202610100005_purchase_ledger.sql` exactly once. Its actual
   prerequisites are authenticated materials plus real Storage; the historical
   combined Storage migration is not a hard dependency. Step 3 supplies the receipt
   service policy/helper/bucket expected by the unchanged frontend and ledger.
7. Apply pending Consumables migrations in this order (skip only genuinely applied
   migrations after ledger verification):
   - `202610220000_consumable_categories.sql`
   - `202610220001_consumables_skus.sql`
   - `202610220002_consumables_archive.sql`
   Install the ledger **before** 001/002. Their optional purchase snapshot extensions
   and archive purchase-link trigger are installed only when Purchases exists.
   Installing the ledger later would miss that integration and needs a separately
   reviewed corrective migration; do not casually rerun the once-only migrations.
8. Follow the preserved [Consumables deployment](../consumables-upgrade-2026-10-22/DEPLOYMENT.md):
   guarded sample-only `02-archive-sample.sql` → repeat `01-preflight.sql` →
   `03-catalog-seed.sql` → `04-verification.sql`. Expect 126 active SKUs at 100/20,
   plus the archived sample still at 24/120 with its four original stock movements.
9. Verify the updated purchase snapshot still has `purchases`, `requests`, `history`,
   receipt path/total/supplier/reference/date/version/request/delivery fields and
   historical actor data. Requests additionally have SKU/specification/archive
   metadata. The frontend consumes these compatible added fields; archived choices
   are hidden for new links, and old linked purchases remain readable/editable.
10. Deploy the already prepared frontend after all database and staging checks.
    Test active Admin/Secretary purchase creation, failure/retry, receipt download,
    existing equipment upload/preview/replacement/discard, and Consumables/archive
    flows. Perform final read-only preservation verification and keep all exports.

If 001/002 were already applied **without** Purchases despite the reported initial
state, stop before ledger installation and prepare a reviewed integration follow-up.
Do not drop/replace existing purchase objects or falsify history to force this plan.

## Staging service tests (manual, not production inventory)

Use only approved staging accounts/files and disposable staging purchase IDs. Check
network responses and persisted state, not merely whether a form displays success.

| Scenario | Expected |
|---|---|
| Active Admin and Secretary: upload PDF, JPEG, PNG, WebP using `<purchase-uuid>/<object-uuid>.<pdf\|jpg\|png\|webp>` | Successful authenticated upload with `upsert:false`; both roles can read company receipts |
| Path traversal, malformed UUID, nested path, uppercase/unsupported extension | Storage policy rejects the insert; no object created |
| Unsupported MIME or file larger than 10,485,760 bytes | Actual Storage API rejects; no persisted object |
| Valid receipt at the allowed limit with supported MIME | Storage service accepts, subject to actual content/service checks |
| Engineer, Architect, Tool Handler, inactive or anonymous upload/read | Denied; no receipt bytes or signed URL returned |
| Authenticated Admin/Secretary signed URL request | Short-lived download works; current frontend requests 300 seconds |
| Anonymous direct private bucket URL | Denied; bucket must remain private |
| Owner-issued signed URL before expiry | Possession grants temporary download; do not claim that it remains role-gated after issuance |
| Reuse a path or attempt upsert/update/delete | Reuse without upsert conflicts; no authenticated receipt update/delete capability |
| Save purchase with its uploaded path | Purchase references its own purchase UUID; original attachment/history persists on replacement |
| Save purchase with another purchase's folder or missing object | Ledger rejects without saved purchase/history change |
| Upload failure then retry in Purchases | Form preserved; successful staged upload is reused; no stock/custody mutations |
| Equipment Photo staged discard | Admin can discard an unlinked photo; linked photo stays protected; field-user visibility unchanged |
| Archived material request selection | No new archived purchase link; existing historical links retained |

The receipt helper intentionally permits active Admin/Secretary company-wide access
to syntactically valid receipt paths, including staged files uploaded before a
purchase record is saved. It does not require a ledger row to exist yet. File size
and MIME enforcement comes from real Storage bucket configuration; SQL row-insert
tests cannot prove the service enforces actual bytes/MIME. The UI additionally
rejects empty/invalid files. A signed URL is a time-limited bearer capability.

Do not delete or mutate production objects for testing. Keep staging fixture
cleanup separate and authorized. Receipt objects intentionally have no client
DELETE/UPDATE workflow; orphan staging cleanup is an owner-reviewed service task,
not a reason to grant broader permissions.

## Migration history and recovery

See [migration gate](../../supabase/migrations/README.md). The historical
`202610100003_feature_storage.sql` was not fully deployed by the Equipment Photo
compatibility step; do not mark it applied merely because some photo objects exist.
Do not run it, strip its guards, create misleading migration entries, or invoke
blind chronological `db push`/`migration up`/wildcard replay. No automatic migration
deployment workflow was found locally. A future automated pipeline requires a
separately reviewed baseline and dependency plan against the real migration ledger.

No old SQL file or migration-history row is changed by this work. Record actual
manual compatibility/ledger/Consumables executions honestly; history repair or
baselining is a distinct operation requiring review.

Each new receipt installation failure rolls back the complete transaction. Review
the reported conflict before retrying; do not erase existing artifacts to pass a
guard. If installed successfully, inspect postflight and history before any
re-execution. Favor a reviewed forward fix. Do not delete receipt objects or
referenced history during rollback, and never revert Equipment Photo compatibility
to repair an unrelated purchase issue. No destructive rollback SQL is supplied.

## Remaining production verification

Live helper bodies/security settings, exact policy predicates and inherited roles,
bucket RLS/service grants, existing receipt artifacts, migration ledger, absence of
partial purchase objects, and real authenticated Storage API behavior require
manual confirmation. Unexpected schema/policy/auth variants fail closed and need
review, not automatic replacement. True separate-backend stock concurrency remains
the existing Consumables staging check, independent of receipt-storage catalog tests.
