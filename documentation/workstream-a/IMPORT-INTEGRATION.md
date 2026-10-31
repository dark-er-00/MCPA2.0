# Individual import quantity expansion

This is an additive adapter and an unapplied RPC extension. It is **not mounted in the application**. Existing Import Tools, manual registration, shared parser/worker and existing migrations are unchanged. Integration requires a later, coordinated shared-file change.

## Files and public API

Load `js/equipment-import-core.js`, then these browser scripts in order:

```html
<script src="js/upgrades/individual-import-expansion/core.js"></script>
<script src="js/upgrades/individual-import-expansion/controller.js"></script>
<script src="js/upgrades/individual-import-expansion/preview.js"></script>
<link rel="stylesheet" href="js/upgrades/individual-import-expansion/styles.css">
```

The core publishes `window.MCPAIndividualImport`; the controller publishes `window.MCPAIndividualImportController`. They also export CommonJS APIs for isolated tests. Paths above are relative to the Admin root page; adjust paths for nested pages.

`window.MCPAIndividualImportPreview.render(containerElement, preview)` mounts the owned read-only preview component and returns `preview.canConfirm`. It displays total source rows versus resulting records, each original source row/item/tracking/provided quantity/result count, row/global validation errors, duplicate warnings and all limits. The table has a caption, scoped headers and a keyboard-focusable scroll region. Spreadsheet values, warnings and errors are escaped. Empty/blocked states are explicit. It provides no confirmation button or mutation; the shared host retains the acknowledgement/confirmation flow. `html(preview)` is available when the host already owns rendering. Optional CSS stays within `.wa-import-preview` and inherits the established light/dark theme.

- `parse(buffer, extension, XLSX?)` returns the legacy sheet shape `{name, headers, rows}`. It enforces a nonempty, at most 2 MiB CSV/XLSX upload and reuses the shared security checks. CSV must be valid UTF-8. XLSX uses the approved local SheetJS dependency.
- `autoMap(headers)` and `fields` reuse existing mapping vocabulary. No Asset ID or custody field is added.
- `validate(sheet, mapping, existingInventory?)` returns row data/errors/warnings, `spreadsheetRows`, `records`/`expandedRecords`, `payloadBytes`, `expandedBytes`, `canConfirm` and each source row's `records` count. Original parser output is never edited.
- `summary(preview)` supplies explicit source-row versus resulting-record wording.
- `templateWorkbook(XLSX)` returns a workbook with an empty real-inventory sheet, separate marked examples and instructions. It requires explicit Condition and explains expansion, serials and limits.
- `resultCsv(receipt)` exports original spreadsheet row, expansion index, database UUID and generated Asset ID for every created record, using existing CSV injection protection.
- `js/upgrades/individual-import-expansion/worker.js` accepts the existing `{buffer, extension}` message and returns `{sheets}` or `{error}`. It reads the same local parser and SheetJS files, and enforces upload size inside the worker. The host must keep the existing ten-second timeout, terminate workers on close/route disposal and discard stale parse responses.

## Meaning and validation

`Individual | Quantity 20` creates twenty equipment rows, each `quantity = 1`, with twenty distinct UUIDs and server-generated Asset IDs. `Bulk | Quantity 225` creates one grouped equipment row with quantity 225. Bulk is accepted only when explicitly supplied; existing inventory is never converted or updated.

For example, one Individual shovel source row with quantity 20 plus one Bulk pipe source row with quantity 225 produces **2 spreadsheet rows → 21 equipment records**. A preview must show each source row's tracking, supplied quantity and resulting record count. Bulk quantity describes grouped stock rather than a count of individual Asset IDs.

Quantity must be a positive whole number; blank quantity retains the existing default of 1. Bulk quantities retain the existing positive PostgreSQL integer range, through 2,147,483,647. A nonempty serial on Individual quantity greater than 1 is rejected: one supplied physical serial cannot identify several assets. The user must instead supply one row per serialized asset. A single-asset serial remains literal text, including leading zeros. Repeated literal serials in separate rows retain existing warning/real-schema-constraint behavior.

Condition must be mapped and explicitly supplied as a supported existing value. The adapter does **not** inherit the legacy validator's implicit `Good` default. Users may explicitly record `Not Assessed`. Optional brand, model, serial and details remain blank/absent when not supplied. No condition, brand, model, serial or new metadata is invented. Existing formula, control-character, field-length, category, tracking and Unit validation remains in force. Individual Unit is rejected; Bulk Unit remains optional.

Limits apply simultaneously:

| Boundary | Limit |
| --- | --- |
| Raw nonempty upload | 2 MiB |
| Source data rows | 500 |
| Columns | 50 |
| Resulting physical Individual/grouped Bulk equipment rows | 500 |
| Original accepted row JSONB text | 2 MiB |
| Expanded accepted row JSONB text | 2 MiB |

The adapter counts JSONB separator spaces and UTF-8 bytes, including deterministic internal source numbering, before confirmation. SQL independently enforces both row-data limits. XLSX archive protections remain authoritative in the shared parser: at most 512 entries, 20 MiB total expanded archive, 10 MiB per entry, no ZIP64/encryption/macros/external links/embedded executable content, supported cell types and no formulas. A file is never automatically split into multiple commits; exceeding a limit requires separate user-confirmed imports.

## Transaction and recovery contracts

The unapplied `supabase/migrations/202610250001_quantity_material_requests.sql` adds:

```text
mcpa_import_equipment_v2(p_operation_id uuid, p_rows jsonb) -> receipt
mcpa_import_equipment_v2_receipt(p_operation_id uuid) -> receipt | null
```

Both RPCs require an active Admin. `p_rows` contains the **original source rows**, not client-expanded rows. Each object uses the existing whitelist: `source_row`, `name`, `category`, `brand`, `model`, `serial_number`, `condition`, `tracking_type`, `quantity`, `unit`, `details`. A source row is unique within the batch and between 2 and 1,000,000. Custody, dates, status, site, holder, UUID and Asset ID columns remain excluded.

The wrapper validates originals, locks the same operation namespace as v1, expands rows deterministically, then delegates to the existing authoritative import RPC inside one transaction. It does not bypass existing equipment constraints, Office assignment or ID allocation. The existing trigger continues generating `T-` followed by sixteen uppercase UUID hex characters. The original `mcpa_equipment_imports` receipt remains immutable. The new immutable, Admin-readable `mcpa_wa_import_operations` stores the original payload digest and receipt with original provenance; it is metadata referencing the same import operation, rather than competing inventory.

The v2 result keeps `operation_id`, `actor_id`, `created_at`, `created`, `rejected`, `assets`, and adds `spreadsheet_rows` and `expanded_records`. Every asset has the existing `id`, `asset_id`, `name`, `quantity`, plus original `source_row` and one-based `expansion_index`. The internal expanded row numbers in the v1 receipt are not spreadsheet provenance. V2 clients must use the v2 receipt RPC or v2 result. Original-source-to-asset mappings are immutable and stable.

One operation ID is bound to one actor and one original payload. Exact retries return the same receipt without creating more inventory. Changed originals/account and cross-version operation reuse are rejected. Any row, expanded limit or database constraint failure rolls back all equipment and both receipts. Different, explicitly started operation IDs may intentionally register identical additional physical assets.

Create one controller for the mounted import surface:

```javascript
const importCore = window.MCPAIndividualImport;
const importer = window.MCPAIndividualImportController.create({
  client: window.EquipmentTracking.client(),
  requireActor: () => window.MCPAAuth.requireLive(),
  storage: window.sessionStorage,
  crypto: window.crypto
});

const preview = importCore.validate(sheet, mapping, equipmentList);
window.MCPAIndividualImportPreview.render(previewContainer, preview);
// Enable confirmation only for preview.canConfirm plus user acknowledgement.
const receipt = await importer.confirm({sheet, mapping, existing: equipmentList});
// Refresh inventory after a verified receipt; show the generated Asset IDs.
```

The controller revalidates immediately before dispatch, checks live Admin identity before/after asynchronous work, blocks duplicate clicks, persists operation/digest and nonidentifying source counts in actor-scoped session storage, and validates the exact physical record count, unique UUIDs/Asset IDs, source rows and expansion indices in the result. It never stores inventory names or original spreadsheet contents in pending recovery data. It uses a thirty-second response timeout; timeout does not cancel the database transaction.

`pending()` reports an unresolved operation. `recover()` checks its v2 receipt without requiring the spreadsheet. A null receipt leaves the pending operation in place; the original call could still be running. `confirm()` must reuse the same original rows and mappings while pending. Unknown/network outcomes and malformed receipts preserve uncertainty across reloads and subsequent failures. A later lock timeout cannot turn an earlier uncertain call into a safely abandoned operation.

`abandonUncommitted()` is available only after a positively returned database rejection with no earlier uncertain outcome, followed by a successful missing-receipt check. It refuses to discard an interrupted operation. It returns a committed receipt if recovery finds one, so the host must display that result rather than start another batch. The host must never clear pending storage merely because a timeout elapsed, a dialog closed or a receipt check returned null.

## Exact later shared integration

Coordinate these changes with the shared importer owner; none were made here:

1. Load the two adapter scripts after `equipment-import-core.js` and before the shared importer entry script. Point its parser Worker URL to the owned v2 worker, retaining the existing timeout, revision guards, disposal and transferable-buffer behavior.
2. Keep the existing Admin-only button/live-account guard. Instantiate one controller with the existing Supabase client, current live identity, session storage and Web Crypto. Do not expose the extension to demo inventory.
3. Replace legacy preview/confirmation calls to `EquipmentImportCore.validate` with `MCPAIndividualImport.validate`. Mount `MCPAIndividualImportPreview.render(previewContainer, preview)` and use `canConfirm`; the owned component renders `spreadsheetRows` and `records` separately, plus each source row's `records` count and supplied quantity. Replace the legacy “Individual quantity must be 1” help text. Condition now requires a mapping and explicit recorded value.
4. Use the v2 template workbook in the existing download helper. Preserve its empty real-inventory sheet and clearly separate examples.
5. Keep the existing acknowledgement step and invoke `controller.confirm()` with the original sheet/mapping, not synthesized rows. Replace assumptions that `created === originalRows.length`; receipt validation belongs to the controller. Use `resultCsv()` for exports so expanded records retain original provenance.
6. Replace the legacy pending/recovery path for this extension with `pending()` and `recover()`. V1 pending operations retain their existing flow; do not relabel their payloads as v2 or share their session-storage key. Block starting changed originals while a v2 operation is unresolved.
7. Render committed outcomes, generated IDs and the actual expanded count. Call the existing masterlist refresh after commit, preserve its filters, and distinguish “committed but refresh failed” from a failed import. Guard rendering after disposal without pretending a route change cancels a transaction.

## Deployment and verification

Prerequisites: reviewed canonical Office/availability migrations, authenticated role/RLS policy migrations, existing `202610240001_equipment_import.sql`, and all other prerequisites documented for the combined Workstream A migration. Apply neither this nor existing SQL to production from this workstream implementation session. Review policy drift, existing constraints and actual PostgreSQL concurrency before deployment, then reload the PostgREST schema cache. The supplied migration requests a cache reload. The browser needs a secure context for Web Crypto, session storage, local workers and approved SheetJS assets.

Run isolated tests from the repository root:

```powershell
node --test --test-concurrency=1 tests/individual-import-expansion-v2/*.test.cjs
```

The suite covers parser/worker/template security, explicit conditions, grouped Bulk, limits, generated IDs and source provenance, unchanged v1 semantics, RLS/role failures, immutable receipts, transaction rollback, operation/version replay, controller-to-real-SQL compatibility, unknown responses, receipt recovery, duplicate clicks and account changes. Tests use the existing local test dependencies and disposable PGlite fixtures. They do not prove separate-session PostgreSQL lock scheduling, production deployment, browser mounting or complete application integration. No shared runtime wiring is present.

The separate native harness accepts only a PostgreSQL binary directory, creates a fresh temporary cluster/database with random credentials and a random loopback port, and stops that cluster afterward. It never accepts an existing database URL or remote target:

```powershell
node tests/individual-import-expansion-v2/postgres-concurrency.cjs '<complete-local-postgresql-bin-directory>'
```

Final local verification passed **26/26 isolated tests**, recorded in `documentation/workstream-a/import-tests.log`. The native harness also passed **7/7 scenarios** on a fresh PostgreSQL 17.11 cluster at Read Committed isolation. Evidence in `documentation/workstream-a/postgres-concurrency/results.json` includes distinct backend IDs and observed blocking locks for simultaneous expansion retries, competing quantity allocations, mixed legacy allocations, duplicate issuance retries and independent requests competing for stock. The final checks found zero negative stock, missing equipment/stock movement references or waiting locks; the temporary server stopped successfully. This proves the covered local transaction schedules, not production schema compatibility or full browser/application integration.

The incomplete `C:/Program Files/PostgreSQL/17` installation lacked its `share` assets. Verification used an already cached, complete portable PostgreSQL distribution named by the repository's previous native-import report, without downloading or installing software. Starting a disposable local server required a sandbox escalation; the successful run was limited to that new temporary cluster.
