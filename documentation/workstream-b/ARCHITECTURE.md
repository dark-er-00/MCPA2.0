# Workstream B architecture

Starting commit: `251940a` on `Updated-MCPARole`; local development branch:
`feature/custody-lifecycle`. Workstream A's agreed baseline is pending the user's
commit reference. No claim of baseline agreement is made until it is compared.
The reserved migration filename was absent before creation. Existing untracked
`docs/` content predates this work and is outside this workstream.

## Audit

`equipment.current_holder_id`, `site_id`, and `status` are the current custody
authority. `mcpa_movements`, its asset/site joins, operations and reservations
preserve movement history. The private lifecycle serializes movements with
`pg_advisory_xact_lock(672341,2026)` and locks equipment rows. Authenticated
gateways bind the acting profile to `auth.uid()`; private functions are revoked.

The existing `createReturn` immediately inspects/finalizes every supplied unit.
Office returns fix the destination and clear damaged equipment's personal holder.
Existing transfers already reserve exact Asset IDs, retain sender custody on
submission, and require a named recipient's tested inspection before receipt.
Repair reports use the existing `repair` movement kind and Admin repair actions.
The verified inventory reader publishes reservation locks, but has no specific
pending-inspection label. Equipment profile images use their own Storage bucket.

## Decisions

- No replacement of existing RPCs, private custody functions or RLS policies.
- New returns are existing `return` movements with additive per-asset inspections
  and ordinary movement reservations. Custody stays in `equipment`.
- Verified subsets call the existing private return engine within the Admin
  transaction. Generated final return and repair records link back to the batch.
  A scoped completion trigger restores Good condition when that existing engine
  completes a repair originating from a v2 accepted return, restoring requestability.
  Missing/disputed units retain their holder, site and reservation until resolved
  by a later physical inspection. They cannot be silently released or cancelled.
- Transfers call the existing public authenticated submission/receipt gateway.
  New validation requires individual, quantity-one permanent IDs. There is no
  assumption that Workstream A's allocation tables exist.
- Retirement requires a proposal and a different active Admin's approval. No
  active custody, reservation or unresolved request/movement is eligible. Both
  Sold and Disposed use the existing terminal `DISPOSED` equipment literal;
  the immutable approved retirement record distinguishes their business meaning.
- Private evidence is staged, uploaded, checked, then atomically linked by the
  movement operation. Failed uploads do not submit or accept a movement.
- Additive triggers block legacy return bypass for new submissions, invalid
  movements involving retired assets, and custody mutation during an unresolved
  v2 inspection. Historical rows are not rewritten.

## Direction contract

THESIS: Physical receipt is an explicit decision per permanent Asset ID. A batch
is a work queue, never evidence that every item arrived.

OWN-WORLD: Extend the workspace's white/charcoal/gold tokens, Public Sans body,
Fraunces headings, and restrained ruled lists; inherit its optional dark theme.

STORY: Field users assemble a physical batch, then submit. Recipients or Admins
see unresolved units, review photos, and record a deliberate receipt decision.

FIRST VIEWPORT: A concise task heading, explanatory custody status, error/status
region, batch selector, and asset list. Primary submission follows the decisions.
Mobile uses a single column, 44px controls, and an inline camera preview.

FORM: Extend existing operational surfaces with independently mountable modules.
The user's strict file boundary takes precedence over shared design-file edits.

FINISH: Review the mounted modules at desktop and mobile sizes, document the
scope of that review, and preserve the incumbent design files. No raster assets.
