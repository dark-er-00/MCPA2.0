# Admin - Reports / Current and Historical Monitoring

- Only Admin has the Reports route. Duplicate engineer reports files are not a supported route.
- Current inventory is present-day truth even when the selected period is historical.
- Historical inventory is an existing prospective saved observation; no past inventory reconstruction is implemented.
- Weekly capture depends on the installed monitoring scheduler; this documentation does not run it.

## Source evidence

- [1-admin/modules/reports/reports.js:17](../../../../../1-admin/modules/reports/reports.js#L17): Current inventory, historical snapshot and movement report views
- [1-admin/modules/reports/reports.js:41](../../../../../1-admin/modules/reports/reports.js#L41): Period load, invalid range and RPC failures
- [1-admin/modules/reports/reports.js:75](../../../../../1-admin/modules/reports/reports.js#L75): Export uses applied reporting period and actual visible report rows
- [supabase/migrations/202610100006_monitoring.sql:201](../../../../../supabase/migrations/202610100006_monitoring.sql#L201): Admin-only report RPC and inclusive maximum 367-day date range
- [supabase/migrations/202610100006_monitoring.sql:156](../../../../../supabase/migrations/202610100006_monitoring.sql#L156): Prospective server-clock weekly snapshots; scheduler role only
- [js/pdf-reports.js:108](../../../../../js/pdf-reports.js#L108): Export guards, library loading, PDF generation and download failure
