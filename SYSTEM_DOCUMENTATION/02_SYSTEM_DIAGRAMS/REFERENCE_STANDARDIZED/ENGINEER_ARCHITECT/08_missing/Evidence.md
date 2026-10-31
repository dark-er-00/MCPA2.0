# Engineer / Architect - Missing Tools

- Engineer and Architect have identical behavior; a combined role diagram is intended.
- Contract verified statically from current project files. Installation of checked-in SQL on the deployed database is unverified.
- Selections move whole equipment records, not a user-entered partial quantity; the server accepts 1 to 100 unique records.
- Live writes use mcpa_movement_action with a retained operation UUID. Uncertain network retries reuse the saved operation.
- A successful save followed by refresh failure blocks further writes until refresh; distinguish this from a failed transaction.
- Recorded AVAILABLE status does not alone prove request eligibility: damaged/missing condition and allocation guards still apply.
- Only actual returned statuses are documented; the UI has a discrepancy label but this reviewed transaction does not emit it.
- Field personnel report missing equipment and inspect recovery history; only Admin records recovery.
- Initial missing report preserves last holder/project for accountability.

## Source evidence

- [js/permissions.js:6](../../../../../js/permissions.js#L6): Engineer and Architect share routes and operational actions.
- [js/movement-ui.js:33](../../../../../js/movement-ui.js#L33): Authorized records, tool eligibility and form fields.
- [js/movement-ui.js:397](../../../../../js/movement-ui.js#L397): Conditional follow-up forms and recorded details.
- [js/movement-ui.js:451](../../../../../js/movement-ui.js#L451): Inspection validation and submit dispatch.
- [js/movement-cloud.js:29](../../../../../js/movement-cloud.js#L29): Authenticated snapshot, mutation, retained retry UUID and refresh guard.
- [supabase/migrations/202610060002_recipient_identity.sql:3](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L3): Movement transaction, stable recipient, custody and status outcomes.
- [supabase/migrations/202610100001_engineer_portal.sql:128](../../../../../supabase/migrations/202610100001_engineer_portal.sql#L128): Active receiver and destination assignment verification.
- [supabase/migrations/202610100004_movement_cancellation.sql:65](../../../../../supabase/migrations/202610100004_movement_cancellation.sql#L65): Accountable field cancellation, refusal and reopening.
- [supabase/migrations/202610120002_office_returns.sql:111](../../../../../supabase/migrations/202610120002_office_returns.sql#L111): Office-only return wrapper and damaged return custody.
- [supabase/migrations/202610120003_optional_request_purpose.sql:14](../../../../../supabase/migrations/202610120003_optional_request_purpose.sql#L14): Latest purpose validation makes request purpose optional.
- [supabase/migrations/202610200001_verified_request_inventory.sql:12](../../../../../supabase/migrations/202610200001_verified_request_inventory.sql#L12): Verified availability and reservation guard.
