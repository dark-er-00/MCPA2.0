# Admin - Tool Requests

- Source-verified behavior, not a claim that every migration is installed in the deployed database; no live writes were run.
- Live is the default data source. Explicit demo mode uses separate local sample data and is not authority for live role permissions.
- Movement mutations retain an operation UUID for an unchanged retry payload; the database replays a committed identical operation.
- A successful RPC can be followed by snapshot failure. UI then says saved successfully but updated records could not load, marks state stale and blocks further writes until refresh.
- A server validation or network failure displays feedback and retains the form. Refresh is necessary when current state, permissions or reservations changed.
- Closing a detail with unsaved follow-up notes prompts to discard them; canceling the confirmation keeps detail and inputs open. Busy saves cannot be closed.
- Admin has no Create Request form. Engineer/Architect submits a request for their own assigned active project.
- Pending requests do not reserve equipment. Approval reserves whole selected records; release creates a linked pending transfer.
- Release keeps recorded equipment custody/status unchanged while handover is pending. Named Engineer/Architect inspects and receives.
- Admin cannot withdraw, cancel reservations, cancel/refuse/reopen handovers, or confirm receipt.

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
- [js/movement-ui.js:413](../../../../../js/movement-ui.js#L413): Pending approve/reject; approved release; linked handover code.
- [js/movement-ui.js:535](../../../../../js/movement-ui.js#L535): Rejection reason submission.
- [supabase/migrations/202610060002_recipient_identity.sql:88](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L88): Availability, no-holder, reservations and role checks before allocation.
- [supabase/migrations/202610060002_recipient_identity.sql:122](../../../../../supabase/migrations/202610060002_recipient_identity.sql#L122): Approve/reject transitions and release transfer construction.
- [supabase/migrations/202610200001_verified_request_inventory.sql:29](../../../../../supabase/migrations/202610200001_verified_request_inventory.sql#L29): Unavailable condition and request-stock lock checks.
