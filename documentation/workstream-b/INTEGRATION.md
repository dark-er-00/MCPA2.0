# Shared-file integration contract — not applied

All paths below describe future integration changes. This workstream has not
edited a shared entry point, loader, existing movement module, test package,
Masterlist, Workstream A file, or existing SQL migration.

## Mounts and lifecycle

Load `/js/upgrades/custody-lifecycle/module.css` after the existing workspace CSS
in both portals. It uses scoped `.mcpa-custody-v2` rules and inherited light/dark
tokens. The existing host remains responsible for its fonts and authentication.
Supply the existing signed-in `window.supabaseClient`; never construct a second
client or pass service credentials. `MCPAAuth.requireLive()` must succeed before
mounting. The RPCs independently enforce identity and roles.

Each mount is async and returns `{refresh(), destroy()}`. Call `destroy()` on
navigation, logout, role/session change and before remounting. Destroy releases
camera tracks, pending scan callbacks and event listeners. If the host supplies
an API instance, it owns `api.dispose()` as well. Do not keep a shared API across
authenticated identities. Call `refresh()` after successful sibling movements;
do not refresh over an unsaved form. `onChanged(record)` lets the host refresh
its existing inventory/movement stores and notification UI. No Realtime
publication or scheduler configuration is changed by this migration.

```js
// Future host integration; NOT already installed in the current application.
MCPAAuth.requireLive();
const {mountReturnSubmission} = await import(
  '/2-engr/modules/return-inspection-v2/return-submission.mjs');
const mounted = await mountReturnSubmission(hostElement, {
  client: window.supabaseClient,
  onChanged: () => refreshExistingMovementAndInventoryViews()
});
// Before route exit or logout:
mounted.destroy();
```

`refreshExistingMovementAndInventoryViews` is an integration callback placeholder,
not an existing repository function. Use the host's established refresh methods.

| Intended host | Import and mount |
|---|---|
| Engineer/Architect return route | `2-engr/modules/return-inspection-v2/return-submission.mjs`: `mountReturnSubmission` |
| Engineer/Architect transfer form | `2-engr/modules/qr-movements-v2/qr-movements.mjs`: `mountTransferSubmission` |
| Named recipient inbox | same module: `mountTransferInbox` |
| Admin return inspection route | `1-admin/modules/return-inspection-v2/return-inspection.mjs`: `mountReturnInspection` |
| Admin retirement route | `1-admin/modules/asset-retirement-v2/asset-retirement.mjs`: `mountAssetRetirement` |
| Engineer retirement history | `2-engr/modules/retired-equipment-v2/retired-equipment.mjs`: `mountRetiredEquipment` |

`mountReturnInspection` accepts optional `batchId` for notification deep links.
All mounts accept optional `api`, `onChanged` and the signed-in `client`.
Composer mounts optionally accept `decode(video): Promise<string[]>` for a
reviewed local decoder adapter when native BarcodeDetector is unavailable.

The existing return `.js` files contain `MovementUI.mount('return')`, and both
return `.html` files provide `#screen-return`. In the final integration, replace
those mount calls with the appropriate v2 mount into that section. Do not run
the old and new mounts on the same element. The existing `js/app.js` loader
expects classic `.js` modules and a route map; use a thin dynamic-import adapter
or extend its module-loader contract. New retirement/inbox routes also require
approved additions to `js/app.js`, `js/navigation.js`, and `js/permissions.js`.
Their existing role gates must remain; do not bypass `canRoute` to show a page.
Entry-point stylesheet imports would touch `index.html` and `2-engr/index.html`.
These shared changes are deliberately left for the integration owner.

## RPC contract

`mcpa_b_snapshot()` returns version 2, the authenticated profile, custody assets,
active sites/recipients, configured Office, scoped returns with per-unit items,
scoped transfers, permitted retirement records, immutable events, and attached
evidence metadata. It does not expose credentials, emails or signed URLs.
Snapshots are unpaginated at this stage; add scoped pagination before large
enterprise rollouts rather than adding unrestricted table SELECT grants.

`mcpa_b_lookup(p_reference, p_intent)` takes a bare permanent Asset ID or
`mcpa:asset:<Asset ID>` and intent `return` or `transfer`. Existing printed IDs
remain unchanged. Arbitrary URL QRs are not fetched. No secret belongs in a QR.
Manual selection calls the same server endpoint as camera scans.

`mcpa_b_action(p_action, p_payload, p_operation_id)` accepts:

| Action | Payload fields |
|---|---|
| `submitReturn` | `assetIds[]`, configured Office `destinationId`, optional `notes`, `evidenceIds[]` |
| `createTransfer` | `assetIds[]`, `receiverId`, `destinationId`, optional `notes`, `evidenceIds[]` |
| `receiveTransfer` | transfer `id`, `inspections[]` with `toolId`, `condition`, `tested:true`, `physicallyReceived:true`, optional `notes`; damaged items require `disposition:'accepted'` and notes; `evidenceIds[]` |
| `inspectReturn` | batch `id`, selected `inspections[]` with `assetId`, `outcome`, `physicallyReceived`, `notes`; `evidenceIds[]` |
| `proposeRetirement` | `assetId`, `disposition:'sold'|'disposed'`, `reason`, `effectiveDate` |
| `attachRetirementEvidence` | proposal `id`, `evidenceIds[]` |
| `approveRetirement` / `rejectRetirement` | proposal `id`, optional `notes` (required for rejection), `evidenceIds[]` |
| `reportRetirementIssue` | permitted retirement `id`, required `notes` |

Use a UUID operation ID for each deliberate operation and preserve it with the
exact payload when retrying an uncertain response. The API wrapper retains IDs
in memory for identical action/payload/scope. A reload loses that memory: inspect
the server snapshot before issuing a replacement operation. A changed payload
needs a new UUID. The server rejects reuse by a different actor or payload.

Inspection outcomes `good` and `damaged` require physical receipt; `missing` and
`disputed` require no receipt and explanatory notes. Only selected decisions
are saved. A later inspection can resolve missing/disputed items. Accepted items
cannot be accepted again. The existing private lifecycle creates final return
and repair records; the parent batch and immutable events preserve the Admin
decision and link the final return. Existing legacy repair actions remain in use.

Recipient acceptance verifies the full set of named physical assets together.
Partial transfer receipt is not implemented. For a missing/disputed transfer,
leave it pending and use the incumbent authorized refusal/cancellation workflow.
The new inbox does not invoke a refusal automatically.

## Workstream A interface

Use existing `equipment.id` UUIDs internally and permanent `equipment.asset_id`
externally. New custody movements require quantity `1` and tracking type
`Individual`, `Individual Asset` or `Serialized` (normalized). Aggregate legacy
rows are rejected: Workstream A must allocate distinct physical equipment rows
before passing them to this module. Neither workstream may regenerate an Asset
ID during transfer, return or retirement.

The additive asset-join trigger enforces individual, quantity-one rows for every
new transfer, including transfers created through the existing gateway or request
release. Aggregate legacy stock can still have quantity-based requests, but it
must be allocated to physical IDs before release. Existing historical transfer
rows are not rewritten; their original authorized lifecycle remains available.

Allocation/requestability must honor the existing reservation table, current
holder and status. V2 inspection reservations use `RTI-*` movement IDs and the
existing `return` kind. A generic reservation lock already excludes them in the
verified catalog; an integration owner may label these “Awaiting inspection.”
Do not delete these reservations from a quantity allocation or cancellation flow.

Workstream A must preserve `pg_advisory_xact_lock(672341,2026)`, row locks and the
same custody authority, or agree a revised lock protocol before integration.
This migration fingerprints the reviewed private engine and fails on drift;
re-review its subset-return contract after A's SQL is available. Do not merely
change the expected fingerprint to make deployment pass.

Sold/Disposed both use the legacy terminal `DISPOSED` equipment literal, keeping
older enums and request filters safe. Obtain the exact business disposition
from approved `snapshot.retirements` by `equipment_id`. Shared status badges and
reports need this projection to display Sold correctly; they are not edited here.

## Evidence and hosting

Evidence uses private `mcpa-movement-evidence-v2`, separate from profile pictures.
Stage through `mcpa_b_evidence_action('stage', {assetId,phase,targetId?,mimeType,
byteSize}, uuid)`, upload to the returned path using the user's Storage client
with `upsert:false`, then call `complete` with the same UUID. Completion validates
Storage metadata. Link returned IDs in the movement transaction. Phase and asset
ownership are checked at upload/link time; attached files cannot be overwritten
or deleted by browser users. Upload/inspection identities and timestamps remain.

JPEG/PNG/WebP are limited to 5 MiB each and 20 attachments per operation. The
browser checks file signatures; Storage enforces declared MIME/size and completion
checks service metadata. This is not server-side content decoding, malware
scanning or EXIF stripping; add an upload-verification service if those controls
are required. Failed uploads leave custody unchanged. Staged orphan objects can
be removed by their uploader using `createEvidenceUploader().discard(path)`.
No scheduled orphan cleanup is installed. Review retention before adding one;
never delete attached evidence. Signed viewing links expire after 60 seconds.

Camera scanning requires HTTPS/localhost, camera permission and a supporting
native BarcodeDetector, or an injected reviewed decoder. Manual search remains
available. Actual field cameras and iOS browser combinations require device
testing. See [MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector/detect)
and [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
