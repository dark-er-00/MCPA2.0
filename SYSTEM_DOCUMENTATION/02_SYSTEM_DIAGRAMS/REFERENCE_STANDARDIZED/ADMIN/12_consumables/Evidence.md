# Admin - Material Requests / Consumables Procurement

- The UI labels consumable procurement records Purchase Request; these records are distinct from equipment Requests.
- Only one pending/partial material request per consumable is permitted.
- The Requested by input is sent by the UI, but the authenticated server wrapper records the signed-in actor name.
- Quantities support up to three decimal places and a maximum 999999999.999.
- Admin Material Requests is a live-only route; offline demo does not allow it.

## Source evidence

- [1-admin/modules/consumables/consumables.js:62](../../../../../1-admin/modules/consumables/consumables.js#L62): Paged reads, refresh, failure, stock and request filters
- [1-admin/modules/consumables/consumables.js:197](../../../../../1-admin/modules/consumables/consumables.js#L197): Create/edit item and stock forms
- [1-admin/modules/consumables/consumables.js:226](../../../../../1-admin/modules/consumables/consumables.js#L226): Request, receive, cancellation and history forms
- [1-admin/modules/consumables/consumables.js:286](../../../../../1-admin/modules/consumables/consumables.js#L286): Payload validation and actual RPC names
- [1-admin/modules/consumables/consumables.js:312](../../../../../1-admin/modules/consumables/consumables.js#L312): Save errors, confirmed-save refresh failures and retry behavior
- [1-admin/modules/consumables/setup.sql:62](../../../../../1-admin/modules/consumables/setup.sql#L62): Server item, stock, request, receipt and cancellation validation
- [supabase/migrations/202610040001_authenticated_access.sql:242](../../../../../supabase/migrations/202610040001_authenticated_access.sql#L242): Authenticated RPC wrappers restrict materials roles and replace requester with actor.name
