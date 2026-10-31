# Equipment Tracking fixes — October 21, 2026

Implemented on `Updated-MCPARole`. The initial working tree was clean. No commit,
push, pull, merge, reset, deployment, production SQL, production equipment creation,
or production data modification was performed. All write tests used isolated
PGlite PostgreSQL fixtures; browser HTTPS requests were blocked.

## Findings and resulting behavior

**White detail panels:** `showToolProfile()` in
`1-admin/modules/masterlist/masterlist.js` set all three cards to inline
`background:#fff`. This overrode the theme while text inherited dark-mode colors.
Information separators also used `#f0f0f0` and initial history text used `#555`.
The cards, separators, and text now use existing semantic theme variables.
The small QR surface alone remains white, with a 12px quiet margin. Existing
gold timeline indicators and status badges remain intact. Changes are scoped
to Equipment Tracking; no workspace-wide theme override was added.

**Header/scroll behavior:** fresh detail visits now clear the inventory's scroll
offset; the existing History API can subsequently restore a previous visit.
Duplicate profile refresh calls were removed. A browser check starts from a
scrolled inventory and verifies that the detail heading clears the sticky header.

**Creation error:** every insert/update previously requested
`asset_id,image_url,site_id` in its returned projection, including photo-free
saves. The connected environment lacks `equipment.image_url`. The repository's
`202610100003_feature_storage.sql` already defines that optional column, private
bucket, and photo policies, so the frontend and database are out of sync.
The absence is verified; the history of whether that migration was never applied,
partially installed, or later changed was not available.

Photo-free saves now return only `asset_id,site_id` and omit `image_url` from the
payload. A local browser test successfully creates one Office record with the
photo column genuinely absent. With a photo, an authenticated zero-row column
check runs before uploading and presents an explicit setup error if unavailable.
The optional photo feature remains present.

**Photo integration:** JPEG/PNG/WebP MIME and signature validation, image decoding,
and the 5 MB limit remain. Photos use immutable paths in the private
`equipment-photos` bucket and durable `storage://equipment-photos/...` references.
Display uses authorized signed URLs rather than persisted expiring URLs. Local
tests verify upload, persistence after reload, replacement, metadata preservation,
role/custody-based read access, and denied unauthorized writes.

Save locks prevent duplicate submissions. Generated record/asset IDs survive a
retry. An interrupted insert is reconciled by its stable record ID before a new
insert is attempted. An uncertain upload response retains the exact object path;
retry checks that path instead of creating another upload. Definitively rejected
uploads retry directly, avoiding an unnecessary signed-URL error request.

After a metadata failure the staged file stays available for retry. Cancel,
Close, Escape, or clearing/replacing the selection discards the pending upload
through an Admin-only, unlinked-object policy. A committed reference is protected
from deletion, including after a lost save response. Earlier saved replacement
versions are not automatically removed. Cleanup errors keep the form available
for another attempt.

**Mobile form:** the equipment form is now a native modal dialog, with a persistent
header/Close button, one scrolling body, and persistent Save/Cancel footer.
Native dialog focus isolation and Escape handling are retained. The background
is scroll-locked while open and unlocked on close/disposal. Controls use 44px
touch targets; narrow layouts use one field column and 16px input text. Visual
viewport height/offset updates keep controls accessible when screen space shrinks.
Native file selection remains available.

**Favicon:** neither entry point declared a favicon. Both now reference an SVG
version of the existing gold MCPA text mark at the appropriate relative path.
The browser check receives HTTP 200 for the declared icon.

## Read-only live HTTP investigation

Requests used the project's existing publishable key, zero-row REST reads, and
bucket metadata only. No Auth session or service-role credentials were obtained.

| Endpoint | Result and caller | Interpretation |
|---|---|---|
| `/rest/v1/equipment?select=image_url&limit=0` | HTTP 400; `42703`, `column equipment.image_url does not exist`; diagnostic reproduction of the field used by the save caller | Confirms the missing column responsible for the reported save failure |
| `/rest/v1/equipment?select=photo_url&limit=0` | HTTP 400; `42703`; diagnostic only | This alternate field is absent |
| `/rest/v1/equipment?select=photo_path&limit=0` | HTTP 400; `42703`; diagnostic only | This alternate field is absent |
| `/rest/v1/equipment?select=image_path&limit=0` | HTTP 400; `42703`; diagnostic only | This alternate field is absent |
| `/rest/v1/equipment?select=photo&limit=0` | HTTP 400; `42703`; diagnostic only | This alternate field is absent |
| `/rest/v1/equipment?select=image&limit=0` | HTTP 400; `42703`; diagnostic only | This alternate field is absent |
| `/storage/v1/bucket/equipment-photos` | HTTP 400; body `NoSuchBucket`, `Bucket not found`; diagnostic only | Bucket was not visible to this unauthenticated request. This does **not** establish authenticated bucket configuration or distinguish absence from access restrictions |
| `/rest/v1/` | HTTP 401; diagnostic only | Full OpenAPI schema was unavailable with the publishable key alone |

The original save caller is `equipmentForm.onsubmit`, which issued
`POST /rest/v1/equipment?select=asset_id,image_url,site_id` for new records and the
equivalent filtered PATCH for edits. The invalid returned field can fail the
statement even when the INSERT payload contains no photo. The corrected caller
uses `select=asset_id,site_id`.

The two historical HTTP 400 rows in the supplied screenshot are truncated; their
complete original requests/responses were not available as a network trace.
Their individual identities cannot be proved from the screenshot. The missing
column failure was independently reproduced; no unrelated Storage or network
failure has been relabeled as that cause. Intentional alternate-column probes
above are diagnostics, not new application callers. Backend errors remain visible.

## MANUAL SUPABASE STEP and deployment order

1. Manually review the read-only [preflight](../../supabase/equipment-photos-preflight.sql).
   Inspect **all** equipment columns for another photo representation, the existing
   bucket, Storage/equipment RLS, policies, helper definitions, and triggers.
   Common alternate column names were absent in REST checks, but that is not a
   privileged catalog inspection.
2. With the existing authenticated-access/recipient-identity and canonical Office
   configuration already installed, manually review and apply
   [202610210001_equipment_photo_compatibility.sql](../../supabase/migrations/202610210001_equipment_photo_compatibility.sql).
   It adds the nullable `image_url` field if missing, installs only the private
   equipment bucket and its access/reference guards, and permits Admin cleanup
   only for unlinked photo paths. It leaves equipment INSERT/UPDATE permissions,
   custody, quantity, reservations, Office behavior, and history unchanged.
3. Run the read-only [verification](../../supabase/equipment-photos-verification.sql).
   Validate real Storage upload, signed display, and removal in a nonproduction
   Supabase environment before enabling the full photo workflow.
4. Deploy the frontend only after the photo SQL checks pass for the full feature.
   The photo-free fix is backward compatible and can be deployed earlier if
   necessary; photo attempts then stop before upload with the setup message.

The new migration is transactional and repeatable. It refuses alternate photo
columns, conflicting public/MIME/size bucket configuration, unknown or unmarked
Storage policies, disabled RLS, conflicting triggers, and incompatible helpers.
It accepts the reviewed earlier photo implementation without changing purchase
storage. If it aborts, stop for schema/policy review; do not remove safeguards or
blindly apply both attachment migrations. No existing equipment rows are rewritten.
Read-only preflight/postflight files are separate from the migration.

**None of these production steps was executed.** Photo registration is verified
locally with the reviewed schema, not claimed to work in the unchanged production
environment. Authenticated production Storage/RLS configuration remains unverified.

## Automated results

All commands were launched from `tests`; npm commands used `npm.cmd`.
Counts below are per suite and overlap; they must not be added as unique tests.

| Command | Automated result | Browser result |
|---|---|---|
| `npm.cmd test` | 66 passed, 0 failed; all 8 isolated movement database scenarios also passed | Initial sandbox Chrome startup timed out. `node auth.browser.cjs` rerun outside the shell sandbox passed, including Auth, all five roles, route permissions, movement flows, mobile, theme, synchronization, and cleanup |
| `npm.cmd run test:inventory-availability` | 28 passed, 0 failed | Initial sandbox Chrome startup timed out. `node auth.browser.cjs --inventory-availability` rerun passed |
| `npm.cmd run test:equipment-office` | 8 passed, 0 failed | Passed Office creation, Bulk quantities, role-specific interfaces, custody, requests/transfers/returns, both themes and mobile checks |
| `npm.cmd run test:features` | 36 passed, 0 failed at that run | Passed. Final `node auth.browser.cjs --feature-completion` rerun also passed after upload retry changes |
| `node --test feature-frontend.test.cjs equipment-photos-compatibility.test.cjs` | Final: **26 passed, 0 failed**, 0 skipped | Not a browser command |
| `node auth.browser.cjs --equipment-fixes` | Uses real isolated PostgreSQL and local file bytes | **52 assertions passed, 0 failed** in final visual run |

The equipment browser runner first reproduced the absent photo column, saved
without a photo, checked missing-schema failure without uploads/partial records,
then applied SQL **only to its isolated fixture** and tested photo upload/retry,
refresh persistence, a real recorded timeline event, image fallbacks, pending-photo
cleanup, QR payload/decoding, and all requested viewport widths.

An early test reload polled a global before its script loaded; the wait is now
guarded. A reduced-height viewport initially exposed a modal positioning defect;
the viewport-aware positioning fixed it and the final check passed. The sandbox
debugger startup failures were infrastructure failures; they are preserved in
the logs alongside the successful reruns. No final assertion failures remain.

Logs and the 52-assertion manifest are in [test-results](test-results/).
The test harness now honors actual returned SQL projections, so the original
missing-column failure cannot be hidden by an unconditional `RETURNING *` mock.
QR generation/decoding dependencies are test-only and version-pinned.

## Screenshots and visual review

All captures use explicitly isolated fixture equipment and a synthetic test image.
External HTTPS, including the QR provider and web fonts, was blocked. The test
server substituted an offline QR generator; displayed 96px QR pixels plus their
white margin decoded to the exact generated Asset ID in both themes.

| Requested view | Screenshot |
|---|---|
| Desktop dark, photo, timeline and QR | [equipment-details-1440-dark.png](screenshots/equipment-details-1440-dark.png) |
| Desktop light | [equipment-details-1440-light.png](screenshots/equipment-details-1440-light.png) |
| Mobile dark | [equipment-details-393-dark.png](screenshots/equipment-details-393-dark.png) |
| Mobile light | [equipment-details-393-light.png](screenshots/equipment-details-393-light.png) |
| Add New Item desktop | [equipment-add-desktop.png](screenshots/equipment-add-desktop.png) |
| Add New Item mobile, scrolled to footer | [equipment-add-320.png](screenshots/equipment-add-320.png) |
| Details without photo | [equipment-details-no-photo.png](screenshots/equipment-details-no-photo.png) |
| Creation success | [equipment-create-success.png](screenshots/equipment-create-success.png) |
| Missing-schema failure with retained form | [equipment-missing-schema-retry.png](screenshots/equipment-missing-schema-retry.png) |
| Upload failure/retry | [equipment-upload-failure-retry.png](screenshots/equipment-upload-failure-retry.png) |

Additional modal captures: [375px](screenshots/equipment-add-375.png),
[390px](screenshots/equipment-add-390.png), [393px](screenshots/equipment-add-393.png),
[430px](screenshots/equipment-add-430.png), [768px](screenshots/equipment-add-768.png).
The screenshot paths are relative to this report. Screenshots were inspected for
theme consistency, readable text, the photo/QR surfaces, and reachable mobile
actions. The browser checks also verified no horizontal overflow and scrolling
to the form bottom at 320/375/390/393/430/768px, plus a reduced 420px height.

## Exact files

Modified:

- `1-admin/modules/masterlist/masterlist.js` — theme literals, scroll entry,
  native dialog lifecycle, column-independent saves, stable retry reconciliation,
  staged upload cleanup, duplicate profile refresh removal.
- `1-admin/modules/masterlist/masterlist.html` — native dialog and scroll-body/footer structure.
- `1-admin/modules/masterlist/masterlist.css` — scoped profile and responsive dialog rules.
- `js/equipment-photos.js` — schema check, stable uncertain-upload retry and pending removal.
- `index.html` and `2-engr/index.html` — favicon references.
- `tests/auth.browser.cjs` — missing-schema fixture, realistic write projections,
  local removal transport, and offline QR transport for the equipment suite.
- `tests/feature-frontend.test.cjs` — no-photo, schema, duplicate, retry and cleanup coverage.
- `tests/package.json` and `tests/package-lock.json` — equipment test entry point,
  test-only `qrcode` 1.5.4 and `jsqr` 1.4.0.

Created:

- `images/favicon.svg`.
- `supabase/migrations/202610210001_equipment_photo_compatibility.sql`.
- `supabase/equipment-photos-preflight.sql`.
- `supabase/equipment-photos-verification.sql`.
- `tests/equipment-photos-compatibility.test.cjs`.
- `tests/equipment-fixes.browser-checks.cjs`.
- This report, 15 PNG screenshots, the browser assertion JSON, test logs, and the
  Git status snapshot under `documentation/equipment-fixes-2026-10-21/`.

## Git status and practical limits

Branch remains `Updated-MCPARole`; changes are uncommitted. Ten tracked source/test
files are modified, with six new source/SQL/test files and this artifact directory.
See [git-status.txt](test-results/git-status.txt) for the exact final short status.
`git diff --check` passed. No preexisting work was discarded.

Real Supabase Storage behavior, authenticated production catalogs, physical device
keyboard behavior, the production QR provider, and physical printed tags were not
verified. Keyboard behavior was exercised with Chrome viewport resizing. Existing
QR generation/printing code is preserved; only its surrounding detail surface changed.
Signed URLs retain the application's existing expiry behavior.

A pending upload is retained for retry or removed through Cancel/clear. A forcibly
closed tab during an interrupted operation cannot guarantee that cleanup completes;
no server-side expiry job was introduced. Such unlinked private uploads require
an authenticated review, distinguishing pending files from intentionally retained
replacement versions. No blanket deletion or production cleanup was performed.

The UI skill reported an existing stale `.impeccable/design.json` sidecar relative
to `DESIGN.md`. It was left untouched; the skill's `document` command can refresh
that separate design artifact if requested.
