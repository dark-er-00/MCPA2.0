# Admin - Equipment Returns

- Source-verified behavior, not a claim that every migration is installed in the deployed database; no live writes were run.
- Live is the default data source. Explicit demo mode uses separate local sample data and is not authority for live role permissions.
- Movement mutations retain an operation UUID for an unchanged retry payload; the database replays a committed identical operation.
- A successful RPC can be followed by snapshot failure. UI then says saved successfully but updated records could not load, marks state stale and blocks further writes until refresh.
- A server validation or network failure displays feedback and retains the form. Refresh is necessary when current state, permissions or reservations changed.
- Closing a detail with unsaved follow-up notes prompts to discard them; canceling the confirmation keeps detail and inputs open. Busy saves cannot be closed.
- Admin can read returns and follow-up queues but has no create/accept/approve return control.
- Engineer/Architect records completed physical delivery and inspection at configured Office.
- Good returned tools become AVAILABLE at Office with no holder; damaged returns become repair with a report.
- Missing return items keep last holder/location for follow-up and become missing with a report.

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
- [js/movement-ui.js:188](../../../../../js/movement-ui.js#L188): Admin has review panel, no create-return form.
- [js/movement-ui.js:431](../../../../../js/movement-ui.js#L431): Saved return conditions and notes displayed in detail.
- [supabase/migrations/202610060002_recipient_identity.sql:154](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L154): Return record and source snapshot.
- [supabase/migrations/202610060002_recipient_identity.sql:211](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L211): Good/damaged/missing inspection writes and automatic reports.
- [supabase/migrations/202610120002_office_returns.sql:111](../../../../../supabase/migrations/202610120002_office_returns.sql#L111): Office-only authenticated return wrapper.
- [supabase/migrations/202610120002_office_returns.sql:165](../../../../../supabase/migrations/202610120002_office_returns.sql#L165): Damaged physical returns clear personal holder after Office inspection; lost items retain custody.
