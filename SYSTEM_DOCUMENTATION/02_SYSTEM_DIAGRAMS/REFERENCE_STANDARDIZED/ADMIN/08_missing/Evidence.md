# Admin - Missing Equipment

- Source-verified behavior, not a claim that every migration is installed in the deployed database; no live writes were run.
- Live is the default data source. Explicit demo mode uses separate local sample data and is not authority for live role permissions.
- Movement mutations retain an operation UUID for an unchanged retry payload; the database replays a committed identical operation.
- A successful RPC can be followed by snapshot failure. UI then says saved successfully but updated records could not load, marks state stale and blocks further writes until refresh.
- A server validation or network failure displays feedback and retains the form. Refresh is necessary when current state, permissions or reservations changed.
- Closing a detail with unsaved follow-up notes prompts to discard them; canceling the confirmation keeps detail and inputs open. Busy saves cannot be closed.
- Admin reviews missing reports and recovers items; Admin has no manual Create Missing Report form.
- Reports arise from field missing report or lost inspection during return/receipt.
- Recovery sets destination and clears holder. Good recovery sets AVAILABLE; damaged recovery sets repair and creates a new linked repair report.
- The status helper does not rewrite equipment.condition metadata. Requestability still checks that condition and current movement reservations.

## Source evidence

- [js/permissions.js:6](../../../../../js/permissions.js#L6): Admin route and action whitelist; Admin has review actions, no movement creation or receipt.
- [js/movement-ui.js:186](../../../../../js/movement-ui.js#L186): Admin create panels are guidance; actual role and state checks control follow-up forms.
- [js/movement-ui.js:369](../../../../../js/movement-ui.js#L369): Search, status filtering, empty state and movement detail.
- [js/movement-ui.js:314](../../../../../js/movement-ui.js#L314): Dirty follow-up detail prompts before unsaved notes/inspection are discarded.
- [js/movement-ui.js:465](../../../../../js/movement-ui.js#L465): Busy guard, save failures, retained forms and successful render.
- [js/movement-cloud.js:29](../../../../../js/movement-cloud.js#L29): Authenticated snapshot read and verification.
- [js/movement-cloud.js:58](../../../../../js/movement-cloud.js#L58): Permission gate, UUID retry identity, RPC write, committed-write refresh failure.
- [supabase/migrations/202610060002_recipient_identity.sql:3](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L3): Private transaction validates, locks assets, writes movements/reservations/operation audit.
- [supabase/migrations/202610060002_recipient_identity.sql:258](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L258): Authenticated gateway binds actor and enforces exact role action whitelist.
- [supabase/migrations/202610120001_request_turnover_notifications.sql:25](../../../../../supabase/migrations/202610120001_request_turnover_notifications.sql#L25): Movement operation notification trigger; release turnover notice.
- [js/movement-ui.js:430](../../../../../js/movement-ui.js#L430): Recovery form requires project, good/damaged condition and recovery details.
- [js/movement-ui.js:552](../../../../../js/movement-ui.js#L552): Recovery payload and good/damaged success messages.
- [supabase/migrations/202610060002_recipient_identity.sql:170](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L170): Missing status and condition validation; recovery and linked repair creation.
- [1-admin/modules/movements/setup.sql:48](../../../../../1-admin/modules/movements/setup.sql#L48): Equipment status helper changes status only, not condition metadata.
