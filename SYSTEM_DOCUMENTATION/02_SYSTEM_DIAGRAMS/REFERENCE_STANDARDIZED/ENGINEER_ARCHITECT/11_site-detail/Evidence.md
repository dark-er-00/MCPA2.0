# Engineer / Architect - Project Details / Accountability and History

- Project metadata operations preserve equipment assignments; no project deletion action is implemented.
- Movement views derive received transfers and returns; inspections marked lost are excluded from the projected movement list.
- Engineer/Architect equipment totals count asset records; quantity and tracking-type fields are hidden.

## Source evidence

- [1-admin/modules/sites/sites.js:286](../../../../../1-admin/modules/sites/sites.js#L286): Project summary and positive-quantity project inventory
- [1-admin/modules/sites/sites.js:377](../../../../../1-admin/modules/sites/sites.js#L377): Edit validation, insert/update save and failure
- [1-admin/modules/sites/sites.js:429](../../../../../1-admin/modules/sites/sites.js#L429): Archive/restore confirmation and metadata-only save
- [1-admin/modules/sites/sites.js:458](../../../../../1-admin/modules/sites/sites.js#L458): Assigned-tool review and search/status filtering
- [1-admin/modules/sites/sites.js:175](../../../../../1-admin/modules/sites/sites.js#L175): Confirmed transfer / return movement history projection
- [1-admin/modules/sites/sites.js:521](../../../../../1-admin/modules/sites/sites.js#L521): Project-history read and errors
- [1-admin/modules/sites/sites.js:566](../../../../../1-admin/modules/sites/sites.js#L566): Deep link validates target and current assignment
