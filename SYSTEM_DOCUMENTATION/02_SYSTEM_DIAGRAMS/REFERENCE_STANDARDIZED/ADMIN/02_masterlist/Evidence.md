# Admin - Tools and Equipment Masterlist

- No delete action is implemented in the active Admin masterlist UI.
- Bulk selection controls route to repair/transfer review; they do not directly change selected equipment or preselect a movement form.
- Bulk quantity is a whole equipment-record quantity. Unit and quantity labels contain asterisks, but their fields are not HTML-required; do not invent a required-unit validation.
- Adding generates a T- asset identifier and record UUID; inserts AVAILABLE equipment at the configured Office with no holder.
- Editing changes metadata/photo only; the submitted payload does not change location, holder or movement status.
- Optional photo failure prevents metadata saving. An uploaded staged photo is reused on metadata retry; the old stored photo reference is kept unless replacement metadata succeeds.
- The returned row is checked after write. An unverifiable result may already have committed; UI explicitly asks to refresh before retry.
- Popup blockers and external QR service failure have no dedicated caught error path in print functions.

## Source evidence

- [1-admin/modules/masterlist/masterlist.js:37](../../../../../1-admin/modules/masterlist/masterlist.js#L37): Search and category/status/site filters.
- [1-admin/modules/masterlist/masterlist.js:57](../../../../../1-admin/modules/masterlist/masterlist.js#L57): Equipment/site/profile reads; movement verification can fail independently.
- [1-admin/modules/masterlist/masterlist.js:232](../../../../../1-admin/modules/masterlist/masterlist.js#L232): Filtering and ten-row pagination.
- [1-admin/modules/masterlist/masterlist.js:441](../../../../../1-admin/modules/masterlist/masterlist.js#L441): Edit form population.
- [1-admin/modules/masterlist/masterlist.js:475](../../../../../1-admin/modules/masterlist/masterlist.js#L475): Selection controls, navigation redirects, modal, photo checks and save handler.
- [1-admin/modules/masterlist/masterlist.js:606](../../../../../1-admin/modules/masterlist/masterlist.js#L606): Admin gate, metadata payload, Office resolution and insert/update verification.
- [1-admin/modules/masterlist/masterlist.js:713](../../../../../1-admin/modules/masterlist/masterlist.js#L713): Print export includes all filtered rows, not just current page.
- [1-admin/modules/masterlist/masterlist.html:100](../../../../../1-admin/modules/masterlist/masterlist.html#L100): Browser-required form inputs and quantity minimum.
- [js/equipment-tracking.js:13](../../../../../js/equipment-tracking.js#L13): Paged reads and verified mcpa_inventory_office getter.
- [js/equipment-photos.js:22](../../../../../js/equipment-photos.js#L22): Photo MIME/signature/size validation and immutable private upload.
- [supabase/migrations/202610120004_equipment_office_default.sql:43](../../../../../supabase/migrations/202610120004_equipment_office_default.sql#L43): Configured Office getter and prospective AVAILABLE Office insertion policy.
