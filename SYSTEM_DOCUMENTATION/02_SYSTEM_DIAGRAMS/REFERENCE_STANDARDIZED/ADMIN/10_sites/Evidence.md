# Admin - Projects / Site List

- The project list and site-detail route share one loaded module but have separate diagrams.
- Only Admin has project creation/edit/archive controls. Engineer/Architect remains read-only and assigned-project scoped.
- Archival, equipment and history inspection are detailed under Project Details.

## Source evidence

- [1-admin/modules/sites/sites.js:110](../../../../../1-admin/modules/sites/sites.js#L110): Repository selects scoped project RPC or full inventory table reads
- [1-admin/modules/sites/sites.js:219](../../../../../1-admin/modules/sites/sites.js#L219): Refresh, stale record removal and Try Again
- [1-admin/modules/sites/sites.js:355](../../../../../1-admin/modules/sites/sites.js#L355): Project form and complete client validation
- [1-admin/modules/sites/sites.js:149](../../../../../1-admin/modules/sites/sites.js#L149): Admin-only insert/update with updated_at concurrency condition
- [supabase/migrations/202610100001_engineer_portal.sql:49](../../../../../supabase/migrations/202610100001_engineer_portal.sql#L49): Project snapshot restricted to assigned Engineer/Architect
- [supabase/migrations/202610040001_authenticated_access.sql:196](../../../../../supabase/migrations/202610040001_authenticated_access.sql#L196): Only Admin inserts/updates projects
- [supabase/migrations/202610100002_project_history.sql:116](../../../../../supabase/migrations/202610100002_project_history.sql#L116): After-insert/update project history trigger
