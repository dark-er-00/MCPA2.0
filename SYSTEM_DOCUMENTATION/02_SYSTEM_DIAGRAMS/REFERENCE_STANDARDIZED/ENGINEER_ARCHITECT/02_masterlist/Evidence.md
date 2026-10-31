# Engineer / Architect - Equipment Tracking / Personal Masterlist

- Personal Tracking contains confirmed current custody only; available request stock is a separate movement catalog.
- No create, edit, delete, photo upload or custody override controls are present in this operational view.

## Source evidence

- [js/app.js:84](../../../../../js/app.js#L84): Operational masterlist uses field module.
- [js/movement-overview.js:8](../../../../../js/movement-overview.js#L8): Personal custody scope.
- [js/movement-overview.js:58](../../../../../js/movement-overview.js#L58): Search, status, project and custody filters.
- [js/movement-overview.js:89](../../../../../js/movement-overview.js#L89): Personal RPC, error and retry behavior.
- [supabase/migrations/202610100001_engineer_portal.sql:20](../../../../../supabase/migrations/202610100001_engineer_portal.sql#L20): Own holder ID only in personal snapshot.
- [js/equipment-visual.js:24](../../../../../js/equipment-visual.js#L24): Thumbnail and image fallback.
- [js/equipment-photos.js:45](../../../../../js/equipment-photos.js#L45): Authorized photo signed URLs and fallback.
