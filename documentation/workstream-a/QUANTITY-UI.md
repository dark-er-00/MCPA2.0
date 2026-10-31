# Equipment quantity request mounts

These are additive mountable modules. No existing application shell, menu, request page, permission file, equipment importer, custody module, or shared stylesheet was changed. They are not live application routes.

## Files and script order

Load the existing app theme first (`css/global.css`, `css/theme.css`), then the scoped feature stylesheet:

```html
<link rel="stylesheet" href="js/upgrades/quantity-requests/styles.css">
<script src="js/upgrades/quantity-requests/client.js"></script>
<script src="js/upgrades/quantity-requests/view.js"></script>
<!-- Load either or both optional mounts. -->
<script src="2-engr/modules/quantity-requests-v2/index.js"></script>
<script src="1-admin/modules/quantity-allocation-v2/index.js"></script>
```

Resolve these repository-relative paths against the actual deployment base. A page inside `2-engr/` must use `../js/...` for the shared files and `modules/quantity-requests-v2/index.js` for its own mount. Do not use leading `/` paths on a GitHub Pages project subpath without the project prefix.

The mounts inherit existing `body.dark` and semantic theme tokens. All feature CSS selectors start with `.wa-quantity`. No new font or external resource is fetched.

## Host integration contract

After the normal authentication gate resolves an active account, pass its existing authenticated Supabase client and an empty root element:

```js
const controller = MCPAQuantityEngineer.mount({
  root: document.querySelector('#quantity-request-root'),
  supabase: authenticatedSupabaseClient
});
await controller.ready;

// Admin route instead:
const review = MCPAQuantityAdmin.mount({
  root: document.querySelector('#quantity-allocation-root'),
  supabase: authenticatedSupabaseClient
});
await review.ready;

// Refresh after a relevant reservation or inventory change.
await controller.refresh();

// Before route teardown, logout, or switching authenticated identity:
controller.destroy();
```

`root` accepts an element or a selector. Both mounts return `{ready: Promise, refresh(): Promise, destroy(): void}`. They own only that root. They register no global route, login listener, polling timer, or Realtime subscription. The host must destroy the active controller before replacing its authenticated identity. Destroy removes event handlers and root content; reads already in flight cannot be cancelled through this RPC-only adapter, but they cannot render into a destroyed mount.

The eventual host wiring must add the two intended route containers, load the scripts/styles, apply its usual auth/navigation guards, mount the matching role UI, and destroy it on navigation/logout. Those are shared-file integration steps and remain outside this workstream's allowed edits.

## Adapter and transaction contracts

`MCPAQuantityRequests` is a browser global and a CommonJS export for isolated tests. `createClient(supabase, options?)` provides:

| Adapter method | Transactional server call |
| --- | --- |
| `catalog()` | `mcpa_wa_equipment_catalog()` |
| `history()` | `mcpa_wa_equipment_requests()` |
| `submit({typeId,siteId,quantity,purpose,operationId?})` | `mcpa_wa_submit_equipment(p_operation_id,p_type_id,p_site_id,p_quantity,p_purpose)` |
| `suggest(requestId)` | `mcpa_wa_suggest_equipment(p_request_id)` |
| `allocate({requestId,assetIds,requestedQuantity,eligibleAssets,operationId?})` | `mcpa_wa_allocate_equipment(p_operation_id,p_request_id,p_asset_ids)` |
| `reject({requestId,reason,operationId?})` | `mcpa_wa_reject_equipment(p_operation_id,p_request_id,p_reason)` |

`catalog()` must complete before a write. Its authenticated `profile.role` is used for UI hints, with Engineer/Architect permitted to submit and Admin permitted to suggest/allocate/reject. SQL independently authenticates and authorizes every read and write; client-side validation is not an authorization boundary.

The catalog returns `{profile,sites,groups}`. Groups carry the server's exact `type_id`, type/name, compatibility metadata, tracking method, unit, and separate available/reserved/deployed counts. The client never merges types by name. It fails closed on absent/unverified availability. Only positive safe whole counts of 1–100 are accepted for submission, bounded by verified available stock. The selected site must occur in the server-provided assigned active sites; purpose is optional and capped at 2,000 characters.

Grouped Bulk is displayed with its recorded stock and disabled in this workflow. It is not silently expanded or treated as individually allocatable equipment. Empty, damaged/ineligible or otherwise nonrequestable records remain unavailable. Supporting grouped-quantity reservation through existing release/custody requires a separately coordinated integration.

The Admin mount suggests eligible UUIDs, displays their real unique `asset_id` labels, allows adjusting the selection, and enables approval only when exactly the requested quantity is selected. The server locks and checks those same equipment UUIDs and reserves them atomically. UI stock and suggestions are a snapshot, so another Admin can change availability before approval; the server's conflict response is displayed without a fabricated success or local stock adjustment. Refresh fetches a new verified proposal. Approval currently means the entire requested quantity; a lower allocation requires rejecting and resubmitting the intended quantity.

History exposes `id` (quantity request UUID), `movement_id` (existing movement identifier), and `assets:[{id,asset_id}]`. Workstream B can use these stable existing equipment UUIDs and unique labels through the normal movement workflow. These mounts do not write release, custody, return, transfer or disposal state.

Mutations create a cryptographically random operation UUID. Uncertain responses retain it for the same action and exact payload; successful independent submissions get fresh IDs. When Web Crypto and session storage are available, the adapter persists only a SHA-256 payload fingerprint and UUID in a profile-scoped session key, enabling the same values to be retried after a remount/reload. It does not persist the request purpose or allocation payload. Caller-supplied `operationId` is supported for host-managed durable recovery. Server receipts bind the operation to its exact transaction payload. The quantity UI preserves its draft after failures, but does not restore form values after a reload; the user or host must re-enter the identical values to recover that operation. Without session storage, retry keys live only for that adapter instance.

## Isolated verification

Run from repository root; no `tests/package.json` changes are required:

```powershell
node --test tests/quantity-requests-v2/frontend.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
node tests/quantity-requests-v2/frontend.browser.cjs
```

On this managed Windows host the initial sandboxed Chrome session timed out at CDP `Runtime.enable`. The final successful local harness used the existing Chrome binary with the explicit test-only `MCPA_CHROME_NO_SANDBOX=1` option. It serves only a localhost fixture, blocks external HTTPS, and connects to disposable PGlite records. It never uses production Supabase credentials or production SQL. `CHROME_PATH` can select another installed Chrome binary.

Final adapter test result: **11 passed, 0 failed**. Coverage includes invalid quantities and max 100, exact compatibility groups, separate availability, Bulk exclusion, Engineer/Architect role hints, Admin-only actions, exact distinct eligible physical IDs, failure propagation, rejection validation, and operation retry IDs across remounts without storing plain request text. See `quantity-frontend-tests.log`.

Final isolated browser result: **passed**, using **47 real local RPC calls** through the additive SQL migration and authenticated fixture identities. Equipment coverage includes exact variant separation, Bulk disabled, assigned site, Engineer/Architect submission and history, escaping untrusted text, adjustable exact Asset ID allocation, real stock/reservation changes, and rejection history. The same browser verifies both consumables mounts: multi-item submission, approval without deduction, partial/full issuance, analytics requested/approved/issued distinction, low stock, and unrecorded consumption. It deliberately discards successful responses after actual database commits for a material submission and partial issuance, then remounts and recovers with the same operation UUID; requests, issues and stock deductions remain unique. See `browser-tests.log`.

Mobile checks assert no horizontal page overflow and that equipment quantity, consumables quantity, and Admin issuance inputs fit the viewport at 393/430 pixels. Six light/dark screenshots were saved and visually inspected in `screenshots/`:

- `quantity-engineer-393-light.png`
- `quantity-engineer-430-dark.png`
- `quantity-admin-1440-light.png`
- `consumables-engineer-393-light.png`
- `consumables-admin-1440-light.png`
- `consumables-admin-430-dark.png`

The browser intentionally mounts owned modules in an isolated shell. It proves real local transactional/RLS behavior through those mounts, not full application navigation, hosted deployment, realtime delivery, or real PostgreSQL parallel scheduling. Database/concurrency tests and deployment prerequisites are documented separately. The migration remains unapplied outside disposable tests.
