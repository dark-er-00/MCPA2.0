# Consumables upgrade implementation report

22 October 2026 · Asia/Manila · branch `Updated-MCPARole`

**Archive compatibility update:** see [ARCHIVE-COMPATIBILITY.md](ARCHIVE-COMPATIBILITY.md)
for the subsequent user-reported production preflight, guarded sample-only archival,
current tests and deployment sequence. It supersedes the initial report's unknown
production reconciliation counts. The sample and all four stock movements are
preserved; archived items are excluded from active workflows and catalog ambiguity.
The new archive schema/SQL remains local and unapplied by this agent.

Implemented for local review. The supplied fallback catalog represents **60 source
families and 126 SKU variants across 12 categories**. Each newly seeded SKU receives
**100** stock and a default minimum of **20**. Production SQL was prepared but
**never executed**. No live inventory was read or changed. All changes remain
uncommitted and unpushed.

## Existing implementation and root analysis

- Initial branch was `Updated-MCPARole`; working tree was clean. Latest commits:
  `cb0bcc2` (equipment UI/photo fixes), `b7c9644` (flowchart), `4d21ca7`
  (documentation), `c2a4f39` (login/notifications), `ce096f7` (available tools).
  No pull, checkout, merge, reset, commit or push was performed.
- Material Requests is the `consumables` route. Its existing module contains
  inventory, requests and receiving together; there is no additional tab that
  needs selecting. The module loader fetches its HTML and reruns its closure.
- The inventory had name, unit, stock/minimum, generated stock status and version;
  requests retain item-name/unit snapshots and stable consumable references;
  stock movements record deltas, final balances, reasons, dates and receipt links.
- The key obstacle to variant stock was `consumables_unique_name`, which allowed
  only one normalized name. Separate specifications now have distinct identities.
- Existing stock RPCs already use row locks, version checks, operation UUIDs,
  transactions, non-negative numeric CHECKs, one-open-request uniqueness and partial
  receipt rules. These stock/receipt functions were preserved instead of replaced.
- The historical bootstrap/README predated real authentication. The deployed-compatible
  auth migration moves core functions to `mcpa_auth_private`, creates identity/role
  wrappers, and limits materials access to active Admin/Secretary profiles. The
  upgrade follows those conventions; the README now explains that bootstrap must
  not be rerun over an authenticated deployment.
- The actual Dashboard is rendered by `js/dashboard-view.js` through
  `MovementOverview`, not its mostly empty module HTML. This checked-out version
  had four equipment/project KPIs and no working Consumables shortcut. The upgrade
  adds the requested navigation card while retaining all four metrics, analytics,
  custody, movement and project behavior.
- The workbook was absent from the workspace and available attachments. No workbook
  content was inferred: the user-provided catalog is the source. No production
  schema or stored records were accessible locally; read-only preflight SQL is supplied.

## Inventory and import summary

| Category | Prefix | Source families | SKU variants |
|---|---|---:|---:|
| Welding | WEL | 5 | 10 |
| Cutting | CUT | 5 | 8 |
| Grinding & Polishing | GRD | 5 | 11 |
| Drilling | DRL | 5 | 15 |
| Sanding & Abrasives | SND | 5 | 12 |
| Fasteners & Fixings | FAS | 5 | 13 |
| Adhesives & Sealants | ADH | 5 | 7 |
| Tapes | TAP | 5 | 8 |
| Painting | PNT | 5 | 12 |
| Electrical & Plumbing | ELP | 5 | 11 |
| Masonry & Carpentry | MAC | 5 | 10 |
| General Site, Safety & Maintenance | GEN | 5 | 9 |
| **Total** | | **60** | **126** |

[CATALOG.md](CATALOG.md) maps every family, specification, unit and preferred code.
The inventory example rows are not extra imports. Variants are explicit arrays,
not slash-splitting: fractions, compound sanding-belt/screw sizes, flap-disc grits,
orbital-disc grits, gauges, package sizes and paired item names retain their meaning.
`Cleaning Rags` has kg and bundle variants within the same source family.

`js/consumables-catalog.js` centralizes ordered categories, explicit variants,
defaults and search/filter logic. `scripts/generate-consumables.cjs` emits category
SQL, catalog seed, preflight, verification and mapping documentation; `--check`
verifies they match the source. Generated SQL necessarily contains category text,
but it is generated from this same source rather than maintained independently.

Codes increase sequentially per category in source order. A stable
`catalog-20261022:<preferred-code>` identity survives reviewed code collisions.
Existing matching SKU codes are retained. When a preferred code is already used,
the seed allocates above both existing and reserved catalog suffixes for that prefix.
Interactive blank-code allocation uses the same prefix convention under an advisory
transaction lock. Unique indexes enforce codes, natural SKU identity and import keys.

**Insert/match counts:** an empty isolated database inserted **126**, matched **0**;
an immediate re-run inserted **0**, matched **126**, with unchanged records/history.
The reconciliation fixture preserved one existing catalog match and inserted the
other 125, while retaining its separate pre-existing code-collision item. Actual
production insert/match counts are **unknown**. Preflight provides exact-match,
proposed-insert and manual-review counts and candidate IDs for review before import.

The seed never resets a matching balance or threshold. It enriches only missing
classification/code/import metadata. Names/specifications/units and historical
references remain intact. Ambiguous generic names, missing or unrecognized sizes,
unit conflicts and conflicting category/import identity abort the transaction.
[05-existing-stock-review.sql](05-existing-stock-review.sql) is a separate read-only
adjustment proposal, with independent physical-count/approval requirements.

## Unit assumptions

The source examples explicitly establish kg for E6013/Concrete Nails, pcs for metal
cutting/grinding discs and HSS bits, sheet for sandpaper, tube for silicone, and roll
for electrical tape. These are preserved, including the full source specification
`300ml Cartridge` for silicone rather than silently shortening it to the example.

Other inventory units are documented assumptions, reviewable before deployment:

- kg for E7018, MIG wire, TIG filler rod, common wire nails and GI tie wire;
- pcs for blades, discs, brushes/pads, drill/hole/core bits, belts/scouring pads,
  screws, rivets, plugs, roller covers/brushes/tray liners/strainers, ties, tubing,
  connectors and individually counted garbage bags;
- sheet for waterproof sandpaper; roll for other tapes and masonry string;
- tube for construction adhesive, acrylic sealant and pipe-thread sealant;
- bottle for sprays, contact cement, thinner, PVC cement, chalk powder and wood glue;
- pack for epoxy and wood filler, with only the listed weights as specifications;
- pack for dust masks (the supplied 10/50 counts), box for gloves (supplied 100),
  kg/bundle for the corresponding rag variants.

No additional pack sizes, lengths, prices, suppliers, vendors or costs were created.
Counted tubing carries only its listed diameter; no unlisted cut length is assumed.
Bottle/pack units are stock-count labels, not asserted manufacturer packaging.
If actual existing units differ, review them; the importer does not convert stock.

## UI and workflow changes

The category dropdown sits between search and stock status, defaults to All
Categories and uses exactly the specified order. Search spans name/code/category/
specification/unit. Filters combine without changing inventory; counts show the
filtered total, and empty results explain the search/filter mismatch.

Item cells retain the compact existing table while showing code, family name,
specification, category and unit as separate text lines. All current/minimum/status
columns and Purchase Required/Request Stock, Update Stock, Edit and History actions
remain. Native scrolling keeps the table inside the page; its inventory region can
receive keyboard focus. Filters stack on compact screens; existing dialogs scroll.

Add/Edit accepts category, specification and SKU code, with valid-category enforcement
in the UI and database. Unit changes remain prohibited. Quantity validation keeps
failed forms open, reports negative/insufficient stock and prevents repeated saves.
The existing three-decimal quantity model remains supported rather than truncating
production kg histories to integers.

Requests now snapshot SKU/specification without rewriting old request names or
units. Both Material Requests and the optional purchase-ledger picker display the
correct variant. Stable item/request foreign keys remain unchanged. Purchases still
record procurement; only receiving in Material Requests increments stock.

## Database safety and audit

See [STOCK-VALIDATION.md](STOCK-VALIDATION.md) for details. The migration preserves
the existing `numeric(12,3)` columns and generated status, checks historical invalid
values before schema changes, and adds explicit bounded non-negative stock/minimum
and movement balance constraints. Invalid historical data causes failure, with no
silent repair. Non-finite RPC values, excessive precision and overflow are rejected.

Stock usage retains `SELECT ... FOR UPDATE`, then checks operation identity,
expected version and available quantity before changing balance. Receiving locks
the item and then its request. Stock, request receipt and ledger changes commit or
roll back together. Two deductions cannot independently commit from the same
unlocked balance. A conflicting stale-version call fails; an updated-version
deduction larger than remaining stock also fails. Direct browser writes remain denied.

New movement inserts capture verified profile ID/name, generated previous balance,
delta, new balance, reason, timestamp and existing related-request reference.
Database-owner imports are labeled maintenance/catalog import. Old actor identities
are not invented. A trigger makes history immutable. Existing authenticated role
wrappers, RLS and private-function restrictions are preserved; no policy is disabled
or broadened. The old save overload cannot create uncategorized items.

## Dashboard behavior

The entire shortcut is a native button with `data-go="consumables"`; the existing
MovementOverview click handler calls `showScreen('consumables')`. That route is the
actual inventory/requests module. The current navigation system retains authorization,
active indicators, browser history/Back, Enter and Space behavior.

The card uses the existing theme, package icon, padding and typography, with no
large total. Its description is “View stock, requests, and restocking”. A small
amber warning appears only for a positive live count, with correct item/items grammar.
It counts the same generated `out`/`low` statuses used in Consumables, including
zero-stock items. Healthy records hide the pill; read failure shows status unavailable.
It uses the existing Dashboard refresh/watch lifecycle and one additional consumables
read during that cycle, with no new timer or duplicate subscription. Equipment,
custody, movement, project and Office calculations were not changed.

## Verification results

All final commands below exited successfully. Logs are included in this directory.
Independent suites overlap in some dashboard tests; counts are reported per run,
not added into a misleading unique-test total.

| Command / scenario | Pass | Fail | Evidence |
|---|---:|---:|---|
| `npm.cmd test --prefix tests` — main Node test phase | 67 tests | 0 | [main-tests.log](main-tests.log) |
| Same command — movement database scenarios | 8 scenarios | 0 | main-tests.log |
| Same command — authenticated browser regression | 9 reported groups | 0 | main-tests.log |
| Targeted upgrade + dashboard Node tests | 23 tests (12 upgrade + 11 dashboard) | 0 | [upgrade-tests.log](upgrade-tests.log) |
| Additional feature/regression Node suites | 74 tests | 0 | [feature-tests.log](feature-tests.log) |
| Unchanged legacy Consumables database suite | 4 reported groups | 0 | [legacy-consumables-tests.log](legacy-consumables-tests.log) |
| Authenticated `--consumables-upgrade` browser checks | 7 reported groups | 0 | [browser-tests-final.log](browser-tests-final.log) |
| Authenticated `--feature-completion` browser checks | 3 workflow groups plus summary | 0 | [feature-browser-tests.log](feature-browser-tests.log) |
| Authenticated `--equipment-fixes` browser checks | 52 assertions | 0 | [equipment-browser-tests.log](equipment-browser-tests.log) |
| Catalog artifact generation check | 1 check | 0 | `node scripts/generate-consumables.cjs --check` |

Exact additional commands from the repository root:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
$env:MCPA_SKIP_SCREENSHOTS='1' # omit to collect the browser's screenshots
npm.cmd test --prefix tests
node --test --test-concurrency=1 tests/consumables-upgrade.test.cjs tests/dashboard-view.test.cjs
node tests/auth.browser.cjs --consumables-upgrade
node tests/auth.browser.cjs --feature-completion
node tests/auth.browser.cjs --equipment-fixes
node --test --test-concurrency=1 tests/feature-frontend.test.cjs tests/feature-storage.test.cjs tests/purchase-ledger.test.cjs tests/movement-cancellation.test.cjs tests/monitoring-database.test.cjs tests/equipment-photos-compatibility.test.cjs tests/equipment-office.database.test.cjs tests/office-return.database.test.cjs tests/release-compatibility.test.cjs tests/project-history-dependency.test.cjs tests/project-history-repair.test.cjs tests/engineer-portal.database.cjs tests/request-projects.database.test.cjs tests/request-turnover.database.test.cjs
$env:NODE_PATH=(Resolve-Path 'tests/node_modules').Path
node 1-admin/modules/consumables/tests/consumables.database.cjs
node scripts/generate-consumables.cjs --check
git diff --check
```

The new `npm.cmd run test:consumables-upgrade --prefix tests` script combines the
targeted Node/browser commands for future use. It was added after executing the
equivalent direct commands above. No dependencies or lockfiles were changed.

Regression coverage includes equipment availability/photos, Office defaults/returns,
projects and request eligibility, transfers/returns/repairs/missing, permissions,
accountability, purchases/private receipts, reports, activity/notifications and
movement custody/reservations. Test fixtures run locally; HTTPS is blocked in the
browser harness. No production accounts, credentials or records are used.

The new browser scenario verifies **320, 375, 390, 393, 430, 768, 1024 and 1440px**
in both themes: category/filter bounds, table containment, no page overflow,
Add/Edit/Stock/Purchase Request modal scrolling and button visibility. It also
checks Enter/Space, active route/Back, all categories, combined filters, valid new
categories, fractional stock, failed validation, receiving/audit, purchase SKU
labels, plural/singular warnings, existing refresh and warning removal on restock.

Early environment attempts needed correction: the historical suite could not resolve
its nested PGlite dependency until NODE_PATH pointed to installed test dependencies;
headless Chrome initially timed out until the existing restricted-environment
no-sandbox flag was used; the first keyboard simulation lacked the Enter text event.
Final runs above passed. These changes did not require production access.

## Screenshots and limits

Local fixture screenshots: [dark Dashboard](screenshots/dashboard-dark.png),
[light Dashboard](screenshots/dashboard-light.png),
[dark mobile Consumables](screenshots/consumables-dark-393.png),
[light mobile Consumables](screenshots/consumables-light-393.png),
[dark desktop Consumables](screenshots/consumables-dark-1440.png),
[light desktop Consumables](screenshots/consumables-light-1440.png).
The screenshots include the explicitly isolated browser fixture item, so their
inventory count is 127 rather than the source catalog's 126. Dashboard warnings
were produced by test usage, not production shortages. External web fonts/resources
were blocked by the test harness. Visual verification used one batched inspection
and one confirmation pass; no unrelated theme redesign was undertaken.

Remaining review limits:

- Actual production matches, legacy corrections and deployed schema compatibility
  require the supplied read-only preflight and explicit manual review.
- True concurrent PostgreSQL backends were unavailable locally: PGlite serializes
  database work. Automated conflicting submissions verify committed outcomes, stale
  versions and audit rollback, but do not claim a two-backend lock-wait test. The
  staging two-session procedure is in DEPLOYMENT.md. Existing row-lock logic remains.
- Live Supabase connectivity, service-role customizations, migration state and
  optional Realtime publication were not changed or validated remotely.
- The historical standalone browser runner predates the current authenticated shell;
  current browser coverage extends `tests/auth.browser.cjs`. Its database suite was
  preserved and executed. Imported stock awaits manual deployment, not a live import.
- Impeccable reported pre-existing design-sidecar drift. That unrelated design
  metadata was left untouched.

## Files and deployment handoff

[FILES.md](FILES.md) lists every modified/new file, including logs and screenshots.
The implementation consists of scoped Consumables markup/styles/script updates,
the central catalog/generator, two new schema migrations, review-only import SQL,
Dashboard/navigation integration, purchase request labels, regression extensions
and documentation. Existing stock setup, movement SQL, equipment/photo/Office
policies and unrelated migrations remain unchanged.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the complete order, preflight,
reconciliation, staging two-session check, reviewed schema/import execution,
verification, coordinated frontend release and recovery. Production deployment
and any proposed existing-stock correction require separate explicit approval.
