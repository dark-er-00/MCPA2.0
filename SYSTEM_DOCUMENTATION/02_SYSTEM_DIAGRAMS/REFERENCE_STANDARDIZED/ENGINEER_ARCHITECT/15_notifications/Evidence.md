# Engineer / Architect - Notifications / Own-Recipient Monitoring

- Only live sessions with Activity route use notifications; offline demo bell opens Activity instead.
- Notification-generation and weekly-snapshot scheduler operations are server-owned background jobs, not user-triggered actions.
- Admin overdue overview is company-wide; Engineer/Architect overdue overview is filtered to its receiver profile.
- Old notifications are not backfilled; installed migrations and scheduler state require deployment verification.

## Source evidence

- [js/monitoring.js:9](../../../../../js/monitoring.js#L9): Live activity-route eligibility and configuration-error handling
- [js/monitoring.js:56](../../../../../js/monitoring.js#L56): Own snapshot read, refresh serialization and retries
- [js/monitoring.js:81](../../../../../js/monitoring.js#L81): Mark-all serialized writes, partial failure and reconciliation
- [js/monitoring.js:111](../../../../../js/monitoring.js#L111): Individual notice read acknowledgment and record navigation
- [supabase/migrations/202610100006_monitoring.sql:128](../../../../../supabase/migrations/202610100006_monitoring.sql#L128): Own-recipient notification snapshot and overdue scope
- [supabase/migrations/202610100006_monitoring.sql:145](../../../../../supabase/migrations/202610100006_monitoring.sql#L145): Only current recipient can mark an existing notice read
