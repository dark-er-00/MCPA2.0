# Admin - Activity Logs / Saved Movement Audit

- Activity is read-only and contains saved movement actions, not invented general application analytics.

## Source evidence

- [js/movement-overview.js:26](../../../../../js/movement-overview.js#L26): Activity rows and stable movement deep links
- [js/movement-overview.js:89](../../../../../js/movement-overview.js#L89): Authorized MovementStore reads, failure and retry
- [js/movement-overview.js:159](../../../../../js/movement-overview.js#L159): Filtered activity PDF export
- [js/movement-overview.js:187](../../../../../js/movement-overview.js#L187): Exact activity-ID detail and unavailable record
- [js/navigation.js:70](../../../../../js/navigation.js#L70): Action/entity-ID movement route resolution
- [js/pdf-reports.js:108](../../../../../js/pdf-reports.js#L108): Same-account authorization and local PDF generation
