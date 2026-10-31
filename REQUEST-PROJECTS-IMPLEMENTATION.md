# Assigned destination projects in Request Tools

October 12, 2026. Implemented and tested locally. No live project assignments, equipment custody, accounts or historical records were changed. No database deployment, commit, push or frontend publication was performed by this agent.

## Cause and corrected behavior

Request Tools used the shared `siteField()` selector, which combines all sites in the movement snapshot with equipment location names. That list is useful to other movement forms but was too broad for requests.

The authenticated `mcpa_movement_snapshot()` already projects `sites.id`, `name`, `is_active` and `assigned_engineer_id`. An Engineer/Architect receives its own permanent profile ID on assigned sites; other assignment IDs are redacted. The new request-specific selector uses this existing snapshot, requiring an active site whose `assigned_engineer_id` equals the current authenticated `profiles.id`. It does not infer assignment from employee names, tool locations, email, Auth UUID or demo data. No project names or IDs were added to application code.

- One active assigned site: it is automatically selected and submitted through the normal form.
- Multiple active assigned sites: only those choices are offered, with a placeholder until the user chooses.
- No active assigned site: the selector and Submit request button are disabled, with the exact message **“No assigned project site. Please contact your administrator.”**
- Assignment refresh: an allowed selection survives; a removed choice disappears; a sole remaining assignment is selected automatically. No remaining assignments disables submission while preserving equipment selections, purpose and other draft fields. Previously saved requests remain visible through their existing authorization/history.

The existing movement watcher and change event update the selector without rebuilding dirty forms or adding RPCs, subscriptions or intervals. The existing visible-tab 30-second fallback, focus and reconnect refresh remain. The selector uses the current native control styles in Light/Night modes; no layout or theme stylesheet was changed. The explicit offline demo continues to use its separate sample data and never supplies live Supabase assignments.

## Backend enforcement

The existing authenticated request gateway in `202610060002_recipient_identity.sql` already checks:

```sql
exists(select 1 from public.sites
  where name=payload->>'destination'
    and assigned_engineer_id=p.id and is_active)
```

Here `p` is resolved by `mcpa_auth_private.identity()` from the authenticated account. Supplied actor data is removed, the receiver is bound to the authenticated company profile, and the existing engine resolves the canonical destination ID. The Engineer portal, cancellation and Office gateways delegate requests to that same authorization check. Unauthorized/inactive destinations raise `42501` before recording a request. Private functions remain unavailable for direct client execution.

The browser additionally validates its current assigned choices before sending the request, but the RPC remains authoritative against altered frontend state or direct calls. **No new database migration, RPC, permission or RLS change is needed.** The previously provided deployed gateway/return fingerprints match the inspected architecture; both the portal gateway and the Office/cancellation chain were tested locally.

Approval, allocation, release, intended-recipient notifications, inspected receipt, physical custody and activity recording retain their existing operations and validation. Transfers keep their existing destination/recipient and QR behavior. The prior Office return migration remains a separate task; this request-selector change neither installs it nor changes its verified Office binding.

## Files changed

| File | Change |
| --- | --- |
| `js/movement-ui.js` | Request-specific assignment filtering, single-site selection, empty state/submission guard, and draft-preserving refresh. Transfer and Return selectors are unchanged. |
| `tests/request-projects.database.test.cjs` | Existing RPC authorization under portal and Office/cancellation gateways; stable identities, unauthorized/inactive/no-assignment requests, lifecycle and history protection. |
| `tests/request-projects.browser-checks.cjs` | Independent Engineer A/B sessions, Architect, single/multiple/zero assignments, tampering, assignment refresh, lifecycle and responsive themes. |
| `tests/auth.browser.cjs` | New `--request-projects` entrypoint and isolated monitoring fixture for lifecycle verification. |
| `tests/package.json` | `test:request-projects` command. |
| `REQUEST-PROJECTS-IMPLEMENTATION.md`, `documentation/request-projects/screenshots/` | Report and local visual evidence. |

No SQL, project/account editor, authentication, QR library, notification implementation, custody implementation, index page or CSS file was modified.

## Verification

The tests ran against disposable PGlite PostgreSQL fixtures and local Chrome with external HTTPS blocked. Auth/session and camera transport are modeled; actual SQL/RLS/functions execute in the fixture. Engineer A and B use independent browser contexts and different Auth/company UUIDs. These are local controlled test records, not changes to deployed accounts or assignments.

| Scenario | Observed result |
| --- | --- |
| Engineer A, one assigned active site | Only that site offered; automatically selected; valid UI request recorded against its canonical site and company profile. |
| Engineer B, two assigned active sites | Only its two sites offered; placeholder initially; native keyboard/project choice and valid UI request passed. A's session/choices remained independent. |
| Architect, no assignments then one assigned fixture site | Exact message and disabled submission initially; assignment refresh enabled and selected its own site; valid Architect request passed. |
| Unauthorized RPCs | Both Engineers' attempts to request each other's sites rejected. Forged actors/receivers/destination IDs cannot alter the canonical authorized recipient/site. Duplicate display names do not grant another person's assignment. |
| Archived/name-only/no-assignment destinations | Rejected by the existing backend. Inactive and unassigned locations, including Office, are not request options. |
| Assignment changes with a draft | Added choices preserve the valid selected site; revoked choices are removed; sole choice auto-selects; zero assignments disables submission while retaining selected equipment and purpose. Controlled fixture assignment changes were restored. |
| Altered form | Injecting an unauthorized option and enabling disabled controls produces the no-assignment message without a movement write. Direct RPC authorization still rejects the same destination. |
| Existing lifecycle | Admin UI approval/release, intended Engineer notification, tested receipt and personal custody passed. Request creation/approval/release did not prematurely change equipment custody. |
| Historical records | Failed/tampered requests left saved movements, operations, custody and history unchanged. Completed request/history stayed available after assignment removal. |
| Responsive themes | 1440px/393px in Light/Night modes: no document overflow; native select target at least 44px; mobile select font at least 16px. Empty message wraps cleanly. Long project choice remains a native control. |

**Passed:** 9 targeted Node tests (4 new database tests plus existing Engineer portal, synchronization and navigation checks); the dedicated independent-session request-project browser workflow; existing `--portal` and `--flows-only` browser regressions, covering transfer/QR, five-role login/route guards, requests/receipt/returns, outages, draft protection and subscription cleanup. JavaScript syntax and whitespace checks passed. No deployed browser/account or physical-camera smoke test was performed.

Reproduce with `npm --prefix tests run test:request-projects`. The restricted Windows host required the existing optional `MCPA_CHROME_NO_SANDBOX=1` setting. Visual evidence in [`documentation/request-projects/screenshots/`](documentation/request-projects/screenshots/) contains local fixtures only.

## Deployment

Publish the reviewed frontend through the existing `Updated-MCPARole` branch and `/(root)` GitHub Pages configuration. Leave those settings and Supabase project assignments unchanged. **There is no Supabase deployment step for this change** on the inspected authenticated architecture. After publication, smoke-test the Request Tools choices with authorized Engineer/Architect accounts against their existing assignments, without altering assignments or old records merely for demonstration.

Publishing and a deployed smoke test remain pending. If a deployment uses a different gateway than the inspected authenticated stack, inspect that gateway before relying on its assignment enforcement; do not rerun prototype setup scripts or reset data.
