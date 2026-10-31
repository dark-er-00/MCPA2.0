# Import RPC fail-closed review — 24 October 2026

The import migration remains unapplied. All SQL execution for this review occurred in disposable local PGlite fixtures. No production database was accessed, no files were staged, and no commit, push or deployment was performed. HEAD remains `8244863`; the original recovery stash remains `498e0e7a8d8cc7a8d119148646c2c5025bf2e868`. Existing tracked/index state and teammate source changes were preserved.

## Exact changes

1. `supabase/migrations/202610240001_equipment_import.sql`
   - Changed the Admin guard from `actor.role <> 'admin'` to `actor.role IS DISTINCT FROM 'admin'`. A NULL role now explicitly raises SQLSTATE `42501`.
   - Immediately after resolving the canonical Office, added `IF office.id IS NULL` with SQLSTATE `22023` and the message “Canonical Office inventory configuration is missing. Contact Admin.” New registration cannot proceed with a missing Office identity, even if a helper unexpectedly returns NULL.
   - The normal Office helper still rejects absent/inactive/ambiguous configuration. Existing committed-operation receipt recovery remains before the Office lookup, so a retry returns its already committed receipt even if the Office later becomes unavailable; it creates no new equipment.
   - Comparison with the saved stash confirms that **only these two guards changed**. Asset ID generation/format, UUID distinction, accepted fields, quantities, initial custody/status, locking, idempotency, audit, privileges and transaction behavior are unchanged.
2. `tests/equipment-import.database.test.cjs`
   - Added a regression that injects a real active profile with a NULL role through an isolated replacement identity helper. This exercises the RPC's own authorization guard instead of stopping in the normal helper. It requires `42501` and unchanged equipment/movement/receipt counts.
   - Added a regression for an isolated NULL-composite Office helper return, requiring the explicit RPC `22023` error. It also removes the actual private Office configuration in the disposable fixture, verifies rejection with no writes, restores configuration and retries the same operation successfully. Replaying that committed receipt after removing configuration again remains safe and unchanged.
   - Added serial handling checks: duplicate literal serials and blank/omitted serials remain valid without a unique schema constraint, actual tags remain distinct, duplicates warn in preview, existing-inventory unique-identifier conflicts abort the complete batch, and numeric JSON serials are rejected as non-text. The existing general serial-unique-index batch-conflict test remains intact.
   - Added a test that captures the **actual downloadable XLSX**, reads it with the vendored parser, checks its empty Equipment sheet, clearly labeled examples and instructions, compares all mapped fields against the installed RPC whitelist, and registers the examples from both XLSX and CSV export in the disposable database.
3. `tests/equipment-import-fixture.cjs`
   - Added `generatedTemplate()`, a test-only VM capture of `window.EquipmentImport.template()`. It supplies the existing parser and a minimal download sink, making no network request and writing no downloaded file. This tests the real generator without duplicating its headers or example rows.
4. `tests/equipment-import.test.cjs`
   - Added CSV/XLSX tests proving that literal `000042` serials keep leading zeros and receive duplicate warnings, while numeric Excel serial cells must be corrected to Text before import.
5. `documentation/equipment-import-2026-10-24/RPC-HARDENING.md`
   - This report. Test logs are ignored by the existing folder `.gitignore`.

No frontend implementation, generated template content, parser library, teammate code, Git index entry or applied migration was changed.

## Serial-number conclusions

Equipment names are never unique import identifiers. Serial numbers are optional literal metadata under the current migration/fixture contract; duplicate supplied serials warn but are not globally prohibited by this RPC. No serial is fabricated, converted to a number, merged, or used to overwrite existing equipment. Empty/omitted serials remain supported.

Existing database unique constraints/indexes remain authoritative. Both same-batch conflicts and conflicts with already registered identifiers are tested with actual unique indexes in isolated PostgreSQL. Those errors identify the source row and roll back every newly inserted row and the receipt. No new serial uniqueness policy was introduced. Any deployment-specific normalization/case-insensitive uniqueness remains the database's responsibility.

## Template/RPC compatibility

The current download action generates **XLSX only**; there is no separate CSV-template download action. CSV input is supported, so the review verifies a CSV export of the same generated example sheet rather than claiming a second download exists.

The ten generated/mapped fields exactly match the installed RPC's whitelist after adding the parser's `source_row` metadata:

```text
name, category, brand, model, serial_number, condition,
tracking_type, quantity, unit, details
```

Neither template format requires an Asset ID or exposes UUID, status, project, holder, acquisition-date or movement fields. The required mappings remain Item Name, Category and Tracking Type. Condition defaults to Good, quantity to 1, Individual quantity is exactly 1, Bulk quantity stays grouped, and Bulk Unit is optional. The generated examples retain Individual quantity 1 and Bulk quantity 5/Pieces. Both normalized formats are accepted by the real isolated RPC and receive actual `T-` plus 16 uppercase hex tags. Instructions explicitly distinguish example rows from real inventory; no examples were imported outside disposable fixtures.

## Validation

Commands below ran from `tests`, with no production connection:

| Command/check | Result |
| --- | --- |
| `node --test --test-concurrency=1 equipment-import.test.cjs equipment-import.database.test.cjs` | **18 passed, 0 failed**, including both fail-closed regressions, serial behavior, the actual template/RPC round trips and all existing importer cases. |
| `$env:MCPA_CHROME_NO_SANDBOX='1'; $env:MCPA_SKIP_SCREENSHOTS='1'; npm.cmd run test:equipment-import` | 17 tests passed at that point, followed by a passing existing import browser flow: upload/mapping/preview/confirmation, CSV/XLSX, templates, actual IDs/results, retries, reload recovery, tracking/Dashboard, restricted roles and six viewport/theme combinations. The later addition is a test-only serial-type case; final unit totals are below. |
| `node --test --test-concurrency=1 auth-database.test.cjs equipment-office.database.test.cjs office-return.database.test.cjs feature-frontend.test.cjs equipment-photos-compatibility.test.cjs display.test.cjs inventory.test.cjs admin-equipment-summary.test.cjs dashboard-view.test.cjs pdf-reports.test.cjs` | **80 passed, 0 failed**. Covers authorization, Office/returns, manual registration/photos, availability, teammate display terminology, Dashboard/tracking and PDF reporting. |
| Disposable guard mutation checks | Restoring only the old nullable role comparison allowed the injected NULL-role registration; separately removing only the new Office guard allowed the NULL-Office registration. These confirmations show that the new rejection assertions detect the intended regressions. No source mutation was written to disk. |
| JavaScript syntax | `node --check` passed for the three changed test/fixture files. |
| Git checks | `git diff HEAD --check` passed; no unmerged paths; no unstaged tracked changes; original staged paths, HEAD and stash unchanged. |

Logs are `rpc-hardening-targeted-final.log`, `rpc-hardening-import-final.log`, `rpc-hardening-regression.log` and `rpc-hardening-mutation.log` in this ignored documentation folder. No fresh full-repository regression was claimed for this narrow change; the targeted import/browser checks and 80 related regression cases were run.

The normal deployment prerequisites remain: authorized review of the target schema and canonical Office configuration, separate migration approval, and real multi-connection PostgreSQL concurrency testing in a disposable clone. PGlite serializes sessions. This work did not change those limits or deploy the migration.
