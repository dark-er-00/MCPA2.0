# Secure equipment import — local implementation, 24 October 2026

This change is prepared for review on `Updated-MCPARole`, starting from `39e72c6`. No production database was queried or changed; no migration was deployed; no files were staged, committed, pushed, or published. Existing unrelated untracked documentation artifacts were left alone.

## Existing registration architecture and preserved behavior

`1-admin/modules/masterlist/masterlist.js` is the Admin registration implementation. Its form submits to `public.equipment` through the authenticated Supabase client. Before this change it already generated human-readable tags with:

```js
'T-' + crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()
```

The record's separate UUID is generated with `crypto.randomUUID()`. Both values survive uncertain manual-save retries. Equipment photos use the proposed tag during upload, so replacing or reassigning that tag would break compatibility. Manual creation remains intact, including its photo handling, UUID recovery, and tag generation. The only change inside that module is attaching/disposal of the new import UI.

The new shared `BEFORE INSERT` database trigger participates in **every** equipment insert. When no tag is supplied, it uses the same UUID-derived format on the server. Existing manual/photo clients may still supply their stable tag. Every insert takes the same transaction advisory lock, including inserts supplying a manual tag. Generated candidates are checked under that lock; the existing unique index remains the final collision guard. A collision with an explicitly supplied manual tag fails rather than overwriting anything. No sequence, maximum-ID query, preview reservation, separate import ID namespace, or changes to existing tags are introduced.

Imports explicitly insert a null tag, so the shared INSERT trigger allocates the real tag only during confirmed registration. Asset record UUIDs remain separate from tags. Requests, movement assets, holders and history keep their original UUID/tag references.

Repository migrations do not include the original equipment `CREATE TABLE`; their referenced columns and the established disposable fixture provide the local schema contract. Live schema compatibility has **not** been assumed or asserted. The read-only preflight exposes actual column types/defaults, constraints, indexes, triggers, permissions and policies for deployment review. Unknown existing allocators, expression-based name uniqueness, additional required columns, narrower text lengths or other schema drift require review before deployment. Existing schema constraints are never removed to make an import pass.

## Spreadsheet contract

Required mapped headings are **Item Name**, **Category**, and **Tracking Type**. Mappings recognize the aliases in `js/equipment-import-core.js`; unknown columns default to Ignore and cannot become custody or deployment fields.

| Field | Rules |
| --- | --- |
| Item Name | Required non-empty text; identical names and brands are allowed. |
| Category | One of the ten existing Add Item categories. |
| Tracking Type | `Individual` or `Bulk`; spelling/case must match the form. |
| Quantity | Defaults to 1. Positive whole PostgreSQL integer, at most 2147483647. Individual must be exactly 1. |
| Unit | Optional, Bulk only. If provided, one of the eight existing form options. The manual form's Unit label has an asterisk, but its select does not enforce required and its save handler accepts blank; import preserves that executable behavior. |
| Condition | Defaults to `Good`; otherwise one of the five existing form options. |
| Brand, Model, Serial Number | Optional text; numeric Excel serials are rejected so leading zeros are not silently lost. Format identifiers as Text. |
| Identifying Details | Optional text, at most 2000 characters. |

Other supported text fields are limited to 240 characters per value for import safety. Database constraints can be narrower and remain authoritative. Formula/control characters and non-text values in text fields are rejected.

Individual registration creates one physical asset per row with quantity 1. It does **not** expand quantity 5 into five records because the existing manual workflow never accepts Individual quantity 5. Enter five rows instead. Bulk registration creates one record with the supplied grouped quantity. Rows are never merged or summed.

Acquisition Date is intentionally unmapped: the manual form has no acquisition-date input or corresponding registration payload. Its Acquired column displays the registration timestamp. No invented date column was added. Photos, asset IDs, UUIDs, status, holders, project assignments and movement data are also excluded. Invalid dates in an ignored source column are not interpreted. New stock uses the verified manual defaults: `AVAILABLE`, configured canonical Office, no holder, requested initial condition. Damaged stock keeps the existing availability calculation. Actual deployment still uses approved movements.

The downloadable XLSX template contains an empty **Equipment** sheet, a clearly labeled **Examples - do not import** sheet, and **Instructions**. It includes Individual and Bulk examples and states that repeated names are legitimate. The importer displays the selected worksheet and lets the Admin choose another one.

## Validation, preview and duplicate review

CSV uses a strict UTF-8 comma-separated parser with quoting, escaped quotes, multiline values and original physical line references. XLSX uses locally vendored SheetJS CE 0.20.3 in a worker. The UI shows all recognized worksheets; only the selected worksheet is submitted. Neither path evaluates formulas.

Limits: 2 MiB source file, 500 data rows per import, 50 columns, 512 ZIP entries, 20 MiB aggregate expanded XLSX bytes, 10 MiB per entry, and a 10-second worker timeout. ZIP64, encrypted/multidisk archives, macro/binary/ActiveX/embedded-object/external-link parts and very hidden sheets are rejected. Formula cells and unsupported cell types receive row errors. Files are not uploaded to Supabase Storage or any external service. The database separately caps normalized JSON at 2 MiB and 500 rows.

Column mapping rejects missing required fields and repeated target mappings. Preview shows original row numbers, item name, category/tracking, quantity, valid/invalid/warning states, counts and resulting records. It uses “Generated automatically on import”, never speculative tags. Invalid rows block the entire batch; there is no silent skipping.

An identical normalized source row produces a warning that separate physical tools are allowed. A supplied serial number repeated within the file or found in loaded inventory also produces a warning. Names alone are not rejected or merged, and existing name matches are never updated. The inspected migration/fixture contract has no equipment-name or serial-number unique constraint; any real serial uniqueness in the deployed schema remains enforced by PostgreSQL. A local test installs a serial unique index and confirms that a real conflict rolls the whole batch back with a source-row error. A simple unique name index makes migration installation stop for review rather than silently dropping it. Intentionally importing another identical set through a new confirmed operation is allowed.

## Authorization, transaction and retry design

The button is between Export and + Add Item, uses the outlined style and upload icon, and is attached only for a live Admin. Tool Handler, Engineer, Architect, anonymous and demo contexts receive no import action. Keyboard access, native dialog focus trapping, Escape/Cancel, scrollable tables, responsive layouts and both themes are covered locally. Controls prevent duplicate confirmation while the request is running.

`public.mcpa_import_equipment(uuid,jsonb)` independently resolves the active authenticated profile and requires exactly the Admin role. Anonymous/service-role execution is revoked. Authenticated callers have EXECUTE but non-Admins fail the server role check. The function's empty search path and explicit schema references prevent search-path substitution. No service credentials are added to frontend code.

The RPC is a narrowly scoped SECURITY DEFINER operation: it does **not** pretend that owner privileges automatically enforce RLS. It explicitly enforces the reviewed existing INSERT policy's Admin, canonical Office, `AVAILABLE`, and no-holder restrictions and validates every allowed field. Installation refuses missing equipment RLS, additional INSERT/ALL policies, or a changed reviewed INSERT policy. Existing equipment policies/grants and movement workflows are left intact. Existing constraints and triggers still run.

One transaction registers the entire confirmed batch and its receipt. Any malformed or constraint-violating row aborts everything with its source-row reference. No partial-success response is possible. There is no browser-side direct insert fallback.

The Admin confirmation generates an operation UUID. PostgreSQL takes a lock for that operation and checks its immutable receipt. A retry by the same actor with the same canonical JSON digest returns the original result. Another actor or changed payload cannot reuse the operation. A different operation can intentionally register identical physical tools.

Only operation UUID, actor UUID and a SHA-256 digest are retained in per-account **sessionStorage** for uncertain-response recovery. Source rows and the uploaded file are not persisted there. A 30-second response timeout leaves the operation unresolved rather than claiming failure. Reconfirming the same parsed rows reuses the operation; reopening after reload can retrieve its receipt. If no receipt exists yet, the Admin must reselect the same spreadsheet and mappings. Changed rows are blocked until the previous outcome is resolved. After a known rollback response or verified success, the pending metadata is removed. This retention lasts for the browser tab session; closing the tab can lose the recovery reference, so check the audit receipt before repeating an uncertain import in a new session.

## Audit and inventory refresh

`public.mcpa_equipment_imports` stores operation UUID, authenticated profile UUID, server timestamp, normalized request SHA-256 digest, and the actual result. Result entries include source-row reference, database record UUID, generated tag, item name and quantity. No spreadsheet blob or full source payload is retained. The table has RLS, Admin-only SELECT, no client write privileges, and an immutable UPDATE/DELETE trigger. All Admins may inspect receipts; the recovery UI verifies ownership for the current actor. No fictional movements are written as import history.

Success renders the real tags and names and reports created/rejected counts. Download Import Results returns a CSV with the operation, source row, UUID, actual Asset ID, name, quantity and outcome. CSV fields are quoted and dangerous leading formula prefixes are neutralized. Imported text rendered in the UI is HTML-escaped.

Success invokes the normal `initMasterlist()` inventory-loading pathway. It preserves current search/filter values and existing tally functions; new rows can be hidden by existing filters, which the result screen explains. The same data drives Dashboard statistics. A refresh failure is reported as “Import committed” with reload guidance, so it cannot be confused with a failed registration. Retry receipts never append duplicate UI records.

## Source files

New implementation files:

- `js/equipment-import-core.js` — strict CSV/XLSX handling, mapping, validation, duplicate warnings, safe CSV serialization.
- `js/equipment-import-worker.js` — bounded background parser.
- `js/equipment-import.js` — four-step dialog, template/results download, confirmation, retry and receipt recovery.
- `supabase/migrations/202610240001_equipment_import.sql` — shared allocator trigger, import receipt table/RLS/immutability, Admin RPC and deployment guards.
- `supabase/equipment-import-preflight.sql` and `supabase/equipment-import-verification.sql` — read-only deployment review scripts.
- `vendor/sheetjs/xlsx.full.min.js`, `vendor/sheetjs/LICENSE`, `vendor/sheetjs/README.md` — pinned local parser/license/provenance.

Updated integration files:

- `1-admin/modules/masterlist/masterlist.html` — Import Tools button.
- `1-admin/modules/masterlist/masterlist.css` — scoped import dialog styles.
- `1-admin/modules/masterlist/masterlist.js` — import attachment and cleanup only.
- `index.html`, `2-engr/index.html` — shared core/UI scripts, supporting both portal entry paths without runtime CDN dependency.

Test changes:

- New `tests/equipment-import.test.cjs`, `tests/equipment-import.database.test.cjs`, `tests/equipment-import-fixture.cjs`, `tests/equipment-import.browser-checks.cjs`.
- Updated `tests/auth-test-db.cjs`, `tests/auth.browser.cjs`, `tests/package.json` to route the import RPC and isolated browser checks.
- Updated `tests/pdf-reports.test.cjs` to keep PDF assertions for existing report controls while allowing the explicitly requested machine-readable import receipt CSV in the importer only.
- This report, `TESTING.md`, and the local `.gitignore` document the review artifacts. Logs/screenshots/downloads are excluded from Git staging by default.

## Database objects and recovery considerations

The forward-only migration adds three functions (`mcpa_auth_private.equipment_asset_id`, `mcpa_auth_private.equipment_import_immutable`, `public.mcpa_import_equipment`), two triggers, one receipt table, its operation primary key and profile foreign key, and one Admin SELECT policy. Internal functions have no client EXECUTE privileges. Only the public RPC is executable by authenticated users. The trusted migration owner owns the definer functions; verify that owner and ACLs after deployment. No applied migration file is modified. No new equipment-name/serial constraints, sequence, category table or independent equipment masterlist is created.

Review the preflight against the actual target database and canonical Office configuration, then rehearse installation and the full test cases in a disposable clone. The migration intentionally fails rather than replacing unknown objects or relaxing drifted rules. Only an authorized reviewer should later deploy it; this implementation does not apply SQL to production. Until then, the UI reports an unavailable RPC and leaves registration untouched.

If the feature must be disabled after deployment, use a separately reviewed forward migration to revoke the import RPC's authenticated EXECUTE permission and hide/remove the button. Preserve existing assets, tags, receipts and movement references. Do not delete imported equipment or the idempotency ledger as an automatic rollback: assets may already have custody/history, and deleting receipts could make an old retry create duplicates. Restore a failed migration transaction using ROLLBACK; it makes no backfill changes. Registration failures need correction/retry, not compensating deletions. Successful imports require normal approved inventory/accountability procedures for later corrections.

## Remaining limitations and deployment prerequisites

- Live preflight and deployment review remain required; there was no production schema access or production test.
- PGlite runs real PostgreSQL SQL/RLS/functions but serializes fixture sessions. Submitted overlapping calls are covered; **independent PostgreSQL session lock contention is not proven here**. Before deployment, run parallel manual inserts, distinct imports and same-operation retries in a disposable PostgreSQL clone; verify unique tags, one receipt per operation and unchanged counts after retries. Review deadlock/timeout behavior under that clone's transaction isolation and custom triggers.
- Maximum 500 rows per atomic operation; split larger inventories into reviewed batches. There is no automatic partial import, chunk-level recovery or rollback of already successful separate operations.
- Repeated rows/serials are review warnings, not proof of duplication. Cross-file duplicate contents are not globally blocked because identical physical tools are legitimate. Retry protection applies to the confirmed operation UUID.
- CSV must be UTF-8 and comma separated. XLSX files with excessive formatted ranges, unsupported archive content, formulas, very hidden sheets or non-text identifiers must be simplified/exported first. The first worksheet is initially selected and clearly displayed; the Admin may choose another before preview.
- Optional import metadata is limited to fields supported by the manual form. Dates, equipment photos and initial custody/deployment are excluded.
- Session recovery needs the same rows/mappings if no receipt exists and does not store the spreadsheet. Another browser/tab has its own operation; check receipts before repeating an uncertain prior import.
- The Impeccable context loader reported an existing stale `design.json` sidecar relative to login-only `DESIGN.md`. This unrelated design metadata was not changed.

Parser provenance and version were checked against the [official SheetJS browser distribution guidance](https://docs.sheetjs.com/docs/getting-started/installation/standalone/). See `vendor/sheetjs/README.md` for the downloaded file's SHA-256 and license.
