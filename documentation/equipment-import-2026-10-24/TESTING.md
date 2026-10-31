# Local validation

All database tests use disposable PGlite instances. The browser harness substitutes only Supabase transport and runs SQL/RLS/RPCs against the local fixture. External HTTPS is blocked in Chrome. No test uses a production connection or uploads a real spreadsheet.

Commands below were run from `tests` unless another directory is specified. Node version: 24.21.0. Browser environment: Windows headless Chrome. The first browser attempt hit a sandbox/CDP startup timeout; the harness's existing `MCPA_CHROME_NO_SANDBOX=1` option allowed the isolated, network-blocked fixture to start. No application security rule was relaxed.

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 *.test.cjs *.test.mjs engineer-portal.database.cjs` | **216 passed, 0 failed**, about 288 seconds. Includes all 13 new import cases, equipment/photo/default Office, availability, Dashboard, requests, transfers, returns, project assignment/history/construction, authentication/RLS, account management, purchases, consumables, monitoring, PDF and navigation tests. |
| `node --test --test-concurrency=1 equipment-import.test.cjs equipment-import.database.test.cjs` | Initial final targeted run: 12 passed; subsequently added policy/name-uniqueness preflight test also passed in the 216-test run. Current importer files contain 13 tests. |
| `$env:MCPA_CHROME_NO_SANDBOX='1'; node auth.browser.cjs --equipment-import` | Passed; 26 screenshots captured. CSV/XLSX worker, template workbook, sheet choice, mapping/ambiguity, ignored custody/date columns, validation, formula/type/size errors, escaped HTML, confirmation guard, real generated IDs, results download, repeated clicks, offline retry, lost committed response, new intentional operation, reload receipt recovery, filter/tally/Dashboard consistency and hidden controls for unauthorized roles. |
| `$env:MCPA_CHROME_NO_SANDBOX='1'; $env:MCPA_SKIP_SCREENSHOTS='1'; node auth.browser.cjs --equipment-import` | Passed final behavior check, including opening imported equipment through the existing tool profile route; no uncaught browser errors. |
| `node movement-database.test.cjs` | All 8 existing isolated movement scenarios passed. |
| `$env:MCPA_CHROME_NO_SANDBOX='1'; node auth.browser.cjs` | Passed main existing browser suite: account/session/onboarding/recovery, all five roles, direct route guards, request/release/receipt/return, custody sync, module retry, themes/mobile, offline demo and channel cleanup. |
| `node --test seed-test-users.test.mjs seed-transfer-users.test.mjs` (from `scripts`) | 5 passed, 0 failed. No seeding or live account creation was invoked. |
| `$env:NODE_PATH=(Resolve-Path '../../../../tests/node_modules').Path; node consumables.database.cjs` (from `1-admin/modules/consumables/tests`) | Passed both prototype-role scenarios, validation, ledger/requests, retries, stale edits and repeat setup. |
| `$env:NODE_PATH=(Resolve-Path '../../../../tests/node_modules').Path; node sites.database.cjs` (from `1-admin/modules/sites/tests`) | **Existing legacy fixture failure**: `policy "sites_delete" for table "sites" does not exist`, at its line 37. The test alters a policy removed by current `sites/setup.sql` line 170. This script does not load any import source/migration. No project permission change was made to satisfy its obsolete expectation. The current root project/history/construction/assignment tests pass. |

An initial full run found the old PDF-only scan matching the new results CSV. The scan now allows this specifically requested reconciliation file in `js/equipment-import.js` only, retaining its PDF requirement for all existing report controls. The full suite then passed. The first module-specific invocations could not resolve PGlite; the documented `NODE_PATH` points to the already installed root test dependency without installing or changing packages.

The read-only preflight and verification SQL were both executed successfully in a disposable upgraded fixture, with unchanged equipment counts (`sql-artifacts.log`). No production preflight was executed.

`node --check` passed for all 11 new/modified JavaScript/CJS implementation and test files: the three import scripts, Admin masterlist script, four import test/fixture files, auth test database/browser harness, and PDF report test. `git diff --check` passed; Git emitted only its existing CRLF conversion notices. `git diff --cached --name-only` returned no staged files. `git check-ignore` confirmed the new log and screenshot exclusions. The pinned parser's SHA-256 matches `vendor/sheetjs/README.md`.

## Coverage and limits

Import database cases check exact tag shape, UUID/tag separation, same-name/brand assets, manual explicit-tag compatibility and manual omitted-tag generation, immutable Admin receipts, identical-operation retries, changed actor/payload rejection, intentional new identical operation, non-Admin/inactive/anonymous rejection, malformed/forged/oversized rows, complete rollback, positive Individual/Bulk quantities, optional Bulk unit, serial constraint conflicts, normal movement snapshot identity and complete request/approval/release/tested-receipt/Office-return compatibility. Installation guards reject policy drift and equipment-name uniqueness without modifying equipment.

Parser cases check malformed quotes, BOM, multiline CSV row references, alias mappings, repeated target fields, legitimate identical tools, optional/default fields, unsupported types/formulas/control characters, ignored dates/custody, serial warnings, XLSX sheets/formulas/corruption/macro parts/row limits, and CSV formula-injection escaping.

PGlite serializes fixture sessions. `Promise.all` exercises simultaneously submitted logical registrations and retries, but does **not** establish independent PostgreSQL connection contention. A disposable real PostgreSQL/Supabase clone must still exercise the shared allocator lock and same-operation lock under truly concurrent connections before deployment. No native PostgreSQL server, `psql`, or Docker executable was available locally. No production experiment was substituted.

## Screenshots

All screenshots use synthetic fixture identities and actual locally generated IDs. The 26 files are in the ignored `screenshots` directory beside this document:

- `equipment-import-header.png`
- `equipment-import-upload.png`
- `equipment-import-mapping.png`
- `equipment-import-preview.png` (includes duplicate warning)
- `equipment-import-errors.png`
- `equipment-import-interrupted.png`
- `equipment-import-success.png` (real local generated Asset IDs)
- `equipment-import-masterlist.png`
- `equipment-import-{upload,mapping,preview}-{375,768,1440}-{light,dark}.png` (18 responsive/theme captures)

Desktop mapping, successful generated-ID results, header, mobile upload and mobile dark preview were visually inspected. Dialog bounds and page overflow are asserted across all six viewport/theme combinations. The masterlist is refreshed through its normal loader; imported record visibility is also asserted from the loaded inventory, independently of whether pagination/search places that row in the screenshot's viewport.

Logs, screenshots and generated downloads are ignored by this folder's `.gitignore`. They have not been staged. Existing unrelated documentation artifacts remain untouched. PDF regression artifacts generated by the existing suite remain under its existing ignored `tests/artifacts` location.
