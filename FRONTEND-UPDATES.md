# Dashboard and equipment tracking update

This application uses plain HTML/CSS/JavaScript. The existing components remain
in that stack and retain the white, black, and gold tokens and optional dark mode.

## Code

- `js/movement-overview.js`: shared Admin/Engineer dashboard and Engineer equipment list.
- `1-admin/modules/masterlist/masterlist.js`: editable Admin equipment list.
- `js/equipment-tracking.js`: paginated reads, quantity totals, derived availability,
  and subscriptions to `equipment` and `sites`.
- `js/equipment-visual.js`: lazy-loaded `image_url` thumbnails, safe URL handling,
  and tool-specific SVG fallbacks for missing or failed images.
- `1-admin/modules/sites/sites.js`: project archive/restore and inventory views.

UI labels use Projects and Equipment Tracking. Supabase table names, `site_id`,
internal routing IDs, and historical relationships retain their original names.

## Availability and totals

Availability is calculated separately from lifecycle/condition status:

- Assigned `site_id` plus `IN_USE`: Deployed.
- Null `site_id` or `IN_OFFICE`: Available.
- Other combinations: Unavailable.

The same calculation accepts the normalized statuses used in the existing UI.
It follows the client rule even when an unassigned record has another lifecycle
status. It does not modify database custody or movement authorization rules.
Total Equipments sums quantities, including bulk/set quantities. Project tallies
omit zero-quantity equipment. The full equipment tracking list retains records
for inspection and history.

## Supabase deployment

Apply `1-admin/modules/sites/setup.sql` if Projects is not installed, then apply
`1-admin/modules/sites/realtime-archive.sql` in the Supabase SQL Editor. This adds
`is_active`, backfills legacy archives, synchronizes archive fields, preserves
project history, revokes browser DELETE access, and enables the two tables in
the `supabase_realtime` publication. Both scripts are repeatable.

The migration has been tested locally, not applied remotely. Existing read and
update policies remain in effect. Realtime clients must be allowed to read the
rows by those policies. [Supabase Postgres Changes documentation](https://supabase.com/docs/guides/realtime/postgres-changes).

Subscriptions are removed on navigation/page exit. Changes are debounced and
followed by fresh reads; reconnect and a 30-second fallback check recover missed
events. Open project forms are preserved, with a new read after closing.

## Verification

Run `npm.cmd install --prefix tests --ignore-scripts`, then
`npm.cmd run test:inventory --prefix tests`. Tests use local data only and cover
availability, quantities, pagination, subscription cleanup, archive history,
database permissions, browser updates, filters, and responsive layouts.
Chrome is required for browser checks; set `CHROME_PATH` if needed.
